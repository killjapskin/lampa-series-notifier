(function () {
    'use strict';

    var STORAGE_KEY = 'series_notify_subscriptions';
    var COMPONENT_NAME = 'series_notify';
    var MENU_CLASS = 'series-notify-menu-item';
    var HEAD_CLASS = 'series-notify-head-button';
    var STYLE_ID = 'series-notify-styles';

    var headObserver = null;
    var headTimer = null;
    var pendingTorrentObject = null;
    var pendingTorrentMovie = null;

    var manifest = {
        type: 'video',
        version: '1.0.12',
        name: 'Series Notify',
        description: 'Уведомления о новых сериях',
        component: COMPONENT_NAME
    };

    function log(message) {
        try {
            console.log('[Series Notify]', message);
        } catch (error) {}
    }

    function getSubscriptions() {
        var subscriptions = Lampa.Storage.get(
            STORAGE_KEY,
            []
        );

        if (typeof subscriptions === 'string') {
            try {
                subscriptions = JSON.parse(
                    subscriptions
                );
            } catch (error) {
                subscriptions = [];
            }
        }

        return Array.isArray(subscriptions)
            ? subscriptions
            : [];
    }

    function saveSubscriptions(subscriptions) {
        Lampa.Storage.set(
            STORAGE_KEY,
            subscriptions
        );
    }

    function safeClone(value, depth) {
        depth =
            typeof depth === 'number'
                ? depth
                : 0;

        if (depth > 10) {
            return null;
        }

        if (
            value === null ||
            typeof value === 'string' ||
            typeof value === 'number' ||
            typeof value === 'boolean'
        ) {
            return value;
        }

        if (
            typeof value === 'undefined' ||
            typeof value === 'function'
        ) {
            return null;
        }

        if (Array.isArray(value)) {
            var arrayResult = [];

            for (
                var i = 0;
                i < value.length;
                i++
            ) {
                var arrayValue = safeClone(
                    value[i],
                    depth + 1
                );

                if (arrayValue !== null) {
                    arrayResult.push(
                        arrayValue
                    );
                }
            }

            return arrayResult;
        }

        if (typeof value === 'object') {
            var objectResult = {};

            for (var key in value) {
                if (
                    !Object.prototype
                        .hasOwnProperty
                        .call(value, key)
                ) {
                    continue;
                }

                try {
                    var objectValue = safeClone(
                        value[key],
                        depth + 1
                    );

                    if (objectValue !== null) {
                        objectResult[key] =
                            objectValue;
                    }
                } catch (error) {}
            }

            return objectResult;
        }

        return null;
    }

    function normalizeText(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    function getTorrentLink(torrentObject) {
        if (!torrentObject) {
            return '';
        }

        return (
            torrentObject.MagnetUri ||
            torrentObject.magnetUri ||
            torrentObject.magnet ||
            torrentObject.Link ||
            torrentObject.link ||
            torrentObject.Url ||
            torrentObject.url ||
            ''
        );
    }

    function getTorrentTitle(torrentObject) {
        if (!torrentObject) {
            return '';
        }

        return (
            torrentObject.title ||
            torrentObject.Title ||
            torrentObject.name ||
            torrentObject.Name ||
            ''
        );
    }

    function getTorrentTracker(torrentObject) {
        if (!torrentObject) {
            return '';
        }

        return (
            torrentObject.tracker ||
            torrentObject.Tracker ||
            torrentObject.tracker_name ||
            torrentObject.TrackerName ||
            torrentObject.source ||
            torrentObject.Source ||
            ''
        );
    }

    function getSubscriptionId(data) {
        return [
            data.movie_id ||
                data.title ||
                'unknown',

            data.torrent_link ||
                data.torrent_hash ||
                data.torrent_title ||
                'unknown'
        ].join('_');
    }

    function getMovieKey(subscription) {
        if (!subscription) {
            return '';
        }

        if (
            subscription.movie_id !== null &&
            typeof subscription.movie_id !==
                'undefined'
        ) {
            return (
                'id:' +
                String(subscription.movie_id)
            );
        }

        return (
            'title:' +
            normalizeText(
                subscription.title
            )
        );
    }

    function getSubscriptionScore(subscription) {
        var score = 0;

        if (subscription.torrent_object) {
            score += 1000;
        }

        if (subscription.movie_object) {
            score += 800;
        }

        if (subscription.torrent_link) {
            score += 200;
        }

        if (subscription.torrent_hash) {
            score += 50;
        }

        score += Math.floor(
            Number(
                subscription.updated_at || 0
            ) / 1000000000
        );

        return score;
    }

    function mergeNewFiles(first, second) {
        var result = [];
        var used = {};

        var collections = [
            Array.isArray(first)
                ? first
                : [],

            Array.isArray(second)
                ? second
                : []
        ];

        for (
            var i = 0;
            i < collections.length;
            i++
        ) {
            var collection =
                collections[i];

            for (
                var j = 0;
                j < collection.length;
                j++
            ) {
                var file =
                    collection[j] || {};

                var key =
                    file.key ||
                    file.path ||
                    file.title ||
                    String(j);

                if (used[key]) {
                    continue;
                }

                used[key] = true;

                result.push(
                    safeClone(file)
                );
            }
        }

        return result;
    }

    function mergeSubscriptionData(
        preferred,
        secondary
    ) {
        preferred =
            preferred || {};

        secondary =
            secondary || {};

        var merged =
            safeClone(preferred) || {};

        for (var key in secondary) {
            if (
                !Object.prototype
                    .hasOwnProperty
                    .call(secondary, key)
            ) {
                continue;
            }

            if (
                typeof merged[key] ===
                    'undefined' ||
                merged[key] === null ||
                merged[key] === ''
            ) {
                merged[key] =
                    safeClone(
                        secondary[key]
                    );
            }
        }

        merged.new_files =
            mergeNewFiles(
                preferred.new_files,
                secondary.new_files
            );

        merged.created_at =
            Math.min(
                Number(
                    preferred.created_at ||
                    Date.now()
                ),
                Number(
                    secondary.created_at ||
                    Date.now()
                )
            );

        merged.updated_at =
            Math.max(
                Number(
                    preferred.updated_at ||
                    0
                ),
                Number(
                    secondary.updated_at ||
                    0
                )
            );

        merged.id =
            getSubscriptionId(merged);

        return merged;
    }

    function migrateAndDeduplicate() {
        var subscriptions =
            getSubscriptions();

        var grouped = {};
        var order = [];

        for (
            var i = 0;
            i < subscriptions.length;
            i++
        ) {
            var current =
                subscriptions[i];

            var movieKey =
                getMovieKey(current);

            if (!movieKey) {
                continue;
            }

            if (!grouped[movieKey]) {
                grouped[movieKey] =
                    current;

                order.push(movieKey);

                continue;
            }

            var existing =
                grouped[movieKey];

            if (
                getSubscriptionScore(current) >
                getSubscriptionScore(existing)
            ) {
                grouped[movieKey] =
                    mergeSubscriptionData(
                        current,
                        existing
                    );
            } else {
                grouped[movieKey] =
                    mergeSubscriptionData(
                        existing,
                        current
                    );
            }
        }

        var result = [];

        for (
            var j = 0;
            j < order.length;
            j++
        ) {
            result.push(
                grouped[order[j]]
            );
        }

        saveSubscriptions(result);
    }

    function findSubscription(id) {
        var subscriptions =
            getSubscriptions();

        for (
            var i = 0;
            i < subscriptions.length;
            i++
        ) {
            if (
                subscriptions[i].id === id
            ) {
                return subscriptions[i];
            }
        }

        return null;
    }

    function findBestSubscriptionByMovie(
        movieId,
        title
    ) {
        var subscriptions =
            getSubscriptions();

        var best = null;
        var bestScore = -1;

        for (
            var i = 0;
            i < subscriptions.length;
            i++
        ) {
            var subscription =
                subscriptions[i];

            var sameMovie = false;

            if (
                movieId !== null &&
                typeof movieId !==
                    'undefined' &&
                subscription.movie_id !== null &&
                typeof subscription.movie_id !==
                    'undefined'
            ) {
                sameMovie =
                    String(
                        subscription.movie_id
                    ) ===
                    String(movieId);
            } else {
                sameMovie =
                    normalizeText(
                        subscription.title
                    ) ===
                    normalizeText(title);
            }

            if (!sameMovie) {
                continue;
            }

            var score =
                getSubscriptionScore(
                    subscription
                );

            if (score > bestScore) {
                best = subscription;
                bestScore = score;
            }
        }

        return best;
    }

    function normalizeFileKey(file) {
        if (!file) {
            return '';
        }

        var path =
            file.path ||
            file.file ||
            file.name ||
            file.title ||
            '';

        var season =
            typeof file.season !==
                'undefined' &&
            file.season !== null
                ? String(file.season)
                : '';

        var episode =
            typeof file.episode !==
                'undefined' &&
            file.episode !== null
                ? String(file.episode)
                : '';

        return [
            String(path).toLowerCase(),
            season,
            episode
        ].join('|');
    }

    function normalizeTorrentFiles(items) {
        var files = [];

        if (!Array.isArray(items)) {
            return files;
        }

        for (
            var i = 0;
            i < items.length;
            i++
        ) {
            var item =
                items[i] || {};

            var key =
                normalizeFileKey(item);

            if (!key) {
                continue;
            }

            files.push({
                key: key,

                id:
                    typeof item.id !==
                    'undefined'
                        ? item.id
                        : null,

                path:
                    item.path ||
                    item.file ||
                    '',

                title:
                    item.title ||
                    item.path_human ||
                    item.name ||
                    item.path ||
                    '',

                season:
                    typeof item.season !==
                    'undefined'
                        ? item.season
                        : null,

                episode:
                    typeof item.episode !==
                    'undefined'
                        ? item.episode
                        : null
            });
        }

        return files;
    }

    function hasSeriesValue(value) {
        if (
            value === null ||
            typeof value === 'undefined'
        ) {
            return false;
        }

        var text = String(value)
            .toLowerCase()
            .trim();

        if (
            !text ||
            text === '0' ||
            text === '00' ||
            text === '-' ||
            text === 'null' ||
            text === 'undefined'
        ) {
            return false;
        }

        var number = Number(text);

        if (!isNaN(number)) {
            return number > 0;
        }

        return false;
    }

    function hasSeriesPattern(value) {
        var text = String(value || '')
            .toLowerCase()
            .replace(/[._-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();

        if (!text) {
            return false;
        }

        return (
            /\bs\d{1,3}\s*e\d{1,4}\b/i.test(text) ||
            /\b\d{1,3}\s*x\s*\d{1,4}\b/i.test(text) ||
            /\bseason\s*\d{1,3}\b/i.test(text) ||
            /\bepisodes?\s*\d{1,4}\b/i.test(text) ||
            /\bсезон(?:а)?\s*\d{1,3}\b/i.test(text) ||
            /\bсер(?:ия|ии|ий)\s*\d{1,4}\b/i.test(text)
        );
    }

    function isSeriesTorrent(
        torrentObject,
        selectedFile,
        files
    ) {
        selectedFile =
            selectedFile || {};

        if (
            hasSeriesValue(
                selectedFile.season
            ) ||
            hasSeriesValue(
                selectedFile.episode
            )
        ) {
            return true;
        }

        if (Array.isArray(files)) {
            for (
                var i = 0;
                i < files.length;
                i++
            ) {
                var item =
                    files[i] || {};

                if (
                    hasSeriesValue(
                        item.season
                    ) ||
                    hasSeriesValue(
                        item.episode
                    ) ||
                    hasSeriesPattern(
                        item.path
                    ) ||
                    hasSeriesPattern(
                        item.title
                    )
                ) {
                    return true;
                }
            }
        }

        var values = [
            getTorrentTitle(
                torrentObject
            ),
            selectedFile.path,
            selectedFile.file,
            selectedFile.title,
            selectedFile.name,
            selectedFile.path_human,
            selectedFile.first_title
        ];

        for (
            var j = 0;
            j < values.length;
            j++
        ) {
            if (
                hasSeriesPattern(
                    values[j]
                )
            ) {
                return true;
            }
        }

        return false;
    }

    function getPendingNewFiles(subscription) {
        var files =
            subscription &&
            Array.isArray(
                subscription.new_files
            )
                ? subscription.new_files
                : [];

        var pending = [];

        for (
            var i = 0;
            i < files.length;
            i++
        ) {
            if (
                !files[i]
                    .loaded_in_player
            ) {
                pending.push(
                    files[i]
                );
            }
        }

        return pending;
    }

    function refreshUpdateState(subscription) {
        if (!subscription) {
            return subscription;
        }

        var pending =
            getPendingNewFiles(
                subscription
            );

        subscription.has_update =
            pending.length > 0;

        subscription.new_episode =
            pending.length
                ? (
                    pending[
                        pending.length - 1
                    ].episode ||
                    pending[
                        pending.length - 1
                    ].title ||
                    null
                )
                : null;

        return subscription;
    }

    function getNotificationCount() {
        var subscriptions =
            getSubscriptions();

        var count = 0;

        for (
            var i = 0;
            i < subscriptions.length;
            i++
        ) {
            refreshUpdateState(
                subscriptions[i]
            );

            if (
                subscriptions[i]
                    .has_update
            ) {
                count++;
            }
        }

        return count;
    }

    function getMenuTitle() {
        return (
            'Обновления (' +
            getNotificationCount() +
            ')'
        );
    }

    function updateIndicators() {
        var count =
            getNotificationCount();

        $(
            '.' +
            MENU_CLASS +
            ' .menu__text'
        ).text(
            getMenuTitle()
        );

        var headButton =
            $('.' + HEAD_CLASS);

        headButton.toggleClass(
            'series-notify-active',
            count > 0
        );

        headButton
            .find(
                '.series-notify-head-counter'
            )
            .text(
                count > 99
                    ? '99+'
                    : count
            );
    }

    function getActiveMovie() {
        if (
            !Lampa.Activity ||
            typeof Lampa.Activity.active !==
                'function'
        ) {
            return null;
        }

        var active =
            Lampa.Activity.active();

        if (!active) {
            return null;
        }

        if (active.movie) {
            return active.movie;
        }

        if (
            active.object &&
            active.object.movie
        ) {
            return active.object.movie;
        }

        if (active.card) {
            return active.card;
        }

        if (active.item) {
            return active.item;
        }

        return null;
    }

    function installTorrentStartCapture() {
        if (
            !Lampa.Torrent ||
            typeof Lampa.Torrent.start !==
                'function'
        ) {
            return false;
        }

        if (
            Lampa.Torrent.start
                .seriesNotifyWrapped
        ) {
            return true;
        }

        var originalStart =
            Lampa.Torrent.start;

        function wrappedStart(
            torrentObject,
            movie
        ) {
            pendingTorrentObject = null;
            pendingTorrentMovie = null;

            if (torrentObject) {
                pendingTorrentObject =
                    safeClone(
                        torrentObject
                    );
            }

            var activeMovie =
                movie ||
                getActiveMovie();

            if (activeMovie) {
                pendingTorrentMovie =
                    safeClone(
                        activeMovie
                    );
            }

            console.log(
                '[Series Notify] Сохранён объект раздачи:',
                pendingTorrentObject
            );

            console.log(
                '[Series Notify] Сохранён активный объект сериала:',
                pendingTorrentMovie
            );

            return originalStart.apply(
                Lampa.Torrent,
                arguments
            );
        }

        wrappedStart.seriesNotifyWrapped =
            true;

        wrappedStart.seriesNotifyOriginal =
            originalStart;

        Lampa.Torrent.start =
            wrappedStart;

        return true;
    }

    function addStyles() {
        if (
            $('#' + STYLE_ID).length
        ) {
            return;
        }

        var styles = $(
            '<style id="' +
            STYLE_ID +
            '">' +

            '.' +
            HEAD_CLASS +
            '{' +
            'position:relative;' +
            'display:flex;' +
            'align-items:center;' +
            'justify-content:center;' +
            '}' +

            '.' +
            HEAD_CLASS +
            ' svg{' +
            'display:block;' +
            'width:1.5em;' +
            'height:1.5em;' +
            'overflow:visible;' +
            '}' +

            '.' +
            HEAD_CLASS +
            ' .series-notify-active-background{' +
            'display:none;' +
            '}' +

            '.' +
            HEAD_CLASS +
            '.series-notify-active ' +
            '.series-notify-active-background{' +
            'display:block;' +
            '}' +

            '.' +
            HEAD_CLASS +
            '.series-notify-active ' +
            '.series-notify-star{' +
            'fill:#fff;' +
            'stroke:#fff;' +
            '}' +

            '.' +
            HEAD_CLASS +
            '.series-notify-active ' +
            '.series-notify-plus{' +
            'stroke:#fff;' +
            '}' +

            '.series-notify-head-counter{' +
            'display:none;' +
            'position:absolute;' +
            'right:-0.3em;' +
            'top:-0.35em;' +
            'min-width:1.4em;' +
            'height:1.4em;' +
            'padding:0 0.25em;' +
            'border-radius:1em;' +
            'background:#e53935;' +
            'color:#fff;' +
            'font-size:0.55em;' +
            'font-weight:700;' +
            'line-height:1.4em;' +
            'text-align:center;' +
            'box-sizing:border-box;' +
            'pointer-events:none;' +
            'z-index:10;' +
            '}' +

            '.' +
            HEAD_CLASS +
            '.series-notify-active ' +
            '.series-notify-head-counter{' +
            'display:block;' +
            '}' +

            '.series-notify-card-update{' +
            'position:relative;' +
            'box-shadow:' +
            '0 0 0 0.22em #ffb300,' +
            '0 0 1.2em rgba(255,179,0,0.85);' +
            'border-radius:0.35em;' +
            '}' +

            '.series-notify-card-update:after{' +
            'content:"NEW";' +
            'position:absolute;' +
            'right:0.45em;' +
            'top:0.45em;' +
            'padding:0.22em 0.45em;' +
            'border-radius:0.35em;' +
            'background:#ffb300;' +
            'color:#111;' +
            'font-size:0.6em;' +
            'font-weight:700;' +
            'line-height:1;' +
            'z-index:5;' +
            '}' +

            '.series-notify-card-deleted{' +
            'opacity:0.35;' +
            'filter:grayscale(1);' +
            '}' +

            '</style>'
        );

        $('head').append(styles);
    }

    function openUpdates() {
        Lampa.Activity.push({
            url: '',
            title: 'Series Notify',
            component: COMPONENT_NAME,
            page: 1
        });
    }

    function createFallbackMovie(subscription) {
        return {
            id:
                subscription.movie_id,

            title:
                subscription.title,

            name:
                subscription.title,

            original_title:
                subscription
                    .original_title,

            original_name:
                subscription
                    .original_title,

            poster_path:
                subscription.poster,

            backdrop_path:
                subscription.backdrop,

            media_type: 'tv',
            source: 'tmdb'
        };
    }

    function getSavedMovieObject(subscription) {
        if (
            subscription &&
            subscription.movie_object
        ) {
            return safeClone(
                subscription.movie_object
            );
        }

        return createFallbackMovie(
            subscription
        );
    }

    function applyMovieToActiveActivity(
        movieObject
    ) {
        if (
            !Lampa.Activity ||
            typeof Lampa.Activity.active !==
                'function'
        ) {
            return;
        }

        var active =
            Lampa.Activity.active();

        if (!active) {
            return;
        }

        active.movie =
            movieObject;

        active.card =
            movieObject;

        active.item =
            movieObject;

        if (
            active.object &&
            typeof active.object ===
                'object'
        ) {
            active.object.movie =
                movieObject;

            active.object.card =
                movieObject;
        }
    }

    function openSavedTorrent(cardData) {
        if (
            cardData &&
            cardData.series_notify_deleted
        ) {
            log(
                'Сериал уже удалён'
            );

            return;
        }

        var subscription =
            findSubscription(
                cardData
                    .series_notify_id
            );

        if (
            !subscription ||
            !subscription.torrent_object
        ) {
            subscription =
                findBestSubscriptionByMovie(
                    cardData.id,
                    cardData.title ||
                    cardData.name
                );
        }

        if (!subscription) {
            log(
                'Подписка не найдена'
            );

            return;
        }

        if (!subscription.torrent_object) {
            log(
                'Точная раздача не сохранена'
            );

            return;
        }

        if (
            !Lampa.Torrent ||
            typeof Lampa.Torrent.start !==
                'function'
        ) {
            log(
                'Открытие раздачи недоступно'
            );

            return;
        }

        var movieObject =
            getSavedMovieObject(
                subscription
            );

        var torrentObject =
            safeClone(
                subscription
                    .torrent_object
            );

        applyMovieToActiveActivity(
            movieObject
        );

        pendingTorrentMovie =
            safeClone(movieObject);

        pendingTorrentObject =
            safeClone(torrentObject);

        Lampa.Torrent.start(
            torrentObject,
            movieObject
        );
    }

    function saveSubscription(event) {
        var file =
            event.element || {};

        var params =
            event.params || {};

        var movieObject =
            pendingTorrentMovie
                ? safeClone(
                    pendingTorrentMovie
                )
                : safeClone(
                    params.movie || {}
                );

        var movie =
            movieObject || {};

        var torrentObject =
            pendingTorrentObject
                ? safeClone(
                    pendingTorrentObject
                )
                : null;

        pendingTorrentMovie = null;
        pendingTorrentObject = null;

        var currentFiles =
            normalizeTorrentFiles(
                event.items ||
                params.files ||
                []
            );

        if (
            !isSeriesTorrent(
                torrentObject,
                file,
                currentFiles
            )
        ) {
            console.log(
                '[Series Notify] Фильм проигнорирован:',
                getTorrentTitle(
                    torrentObject
                ) ||
                file.path ||
                file.title ||
                file.name ||
                movie.title ||
                movie.name ||
                'Без названия'
            );

            return;
        }

        var subscription = {
            id: '',

            movie_id:
                movie.id ||
                null,

            title:
                movie.name ||
                movie.title ||
                file.first_title ||
                'Без названия',

            original_title:
                movie.original_name ||
                movie.original_title ||
                '',

            poster:
                movie.poster_path ||
                movie.poster ||
                '',

            backdrop:
                movie.backdrop_path ||
                movie.backdrop ||
                '',

            movie_object:
                movieObject,

            torrent_object:
                torrentObject,

            torrent_link:
                getTorrentLink(
                    torrentObject
                ),

            torrent_tracker:
                getTorrentTracker(
                    torrentObject
                ),

            torrent_hash:
                file.torrent_hash ||
                file.hash ||
                '',

            torrent_title:
                getTorrentTitle(
                    torrentObject
                ) ||
                file.path ||
                file.title ||
                file.name ||
                '',

            current_files:
                currentFiles,

            current_file_count:
                currentFiles.length,

            season:
                typeof file.season !==
                    'undefined'
                    ? file.season
                    : null,

            episode:
                typeof file.episode !==
                    'undefined'
                    ? file.episode
                    : null,

            new_files: [],
            has_update: false,
            new_episode: null,

            created_at:
                Date.now(),

            updated_at:
                Date.now()
        };

        var existing =
            findBestSubscriptionByMovie(
                subscription.movie_id,
                subscription.title
            );

        if (existing) {
            subscription =
                mergeSubscriptionData(
                    subscription,
                    existing
                );
        }

        subscription.id =
            getSubscriptionId(
                subscription
            );

        refreshUpdateState(
            subscription
        );

        var subscriptions =
            getSubscriptions();

        var movieKey =
            getMovieKey(
                subscription
            );

        var cleaned = [];

        for (
            var i = 0;
            i < subscriptions.length;
            i++
        ) {
            if (
                getMovieKey(
                    subscriptions[i]
                ) !== movieKey
            ) {
                cleaned.push(
                    subscriptions[i]
                );
            }
        }

        cleaned.push(
            subscription
        );

        saveSubscriptions(cleaned);

        migrateAndDeduplicate();
        updateIndicators();

        if (
            subscription.movie_object &&
            subscription.torrent_object
        ) {
            log(
                'Полный контекст сериала сохранён'
            );
        } else {
            log(
                'Данные сохранены не полностью'
            );
        }
    }

    function playerMatchesFile(
        playerData,
        newFile
    ) {
        if (
            !playerData ||
            !newFile
        ) {
            return false;
        }

        var playerKey =
            normalizeFileKey(
                playerData
            );

        if (
            playerKey &&
            newFile.key &&
            playerKey === newFile.key
        ) {
            return true;
        }

        var playerPath =
            String(
                playerData.path ||
                playerData.file ||
                ''
            ).toLowerCase();

        var newPath =
            String(
                newFile.path ||
                ''
            ).toLowerCase();

        return (
            playerPath &&
            newPath &&
            playerPath === newPath
        );
    }

    function handlePlayerStart(playerData) {
        if (!playerData) {
            return;
        }

        var subscriptions =
            getSubscriptions();

        var changed = false;

        for (
            var i = 0;
            i < subscriptions.length;
            i++
        ) {
            var subscription =
                subscriptions[i];

            if (
                !Array.isArray(
                    subscription.new_files
                )
            ) {
                subscription.new_files =
                    [];
            }

            for (
                var j = 0;
                j <
                    subscription.new_files
                        .length;
                j++
            ) {
                var newFile =
                    subscription
                        .new_files[j];

                if (
                    newFile
                        .loaded_in_player
                ) {
                    continue;
                }

                if (
                    playerMatchesFile(
                        playerData,
                        newFile
                    )
                ) {
                    newFile
                        .loaded_in_player =
                        true;

                    newFile.loaded_at =
                        Date.now();

                    changed = true;

                    break;
                }
            }

            refreshUpdateState(
                subscription
            );

            if (changed) {
                break;
            }
        }

        if (!changed) {
            return;
        }

        saveSubscriptions(
            subscriptions
        );

        updateIndicators();
    }

    function getSubscriptionSortTime(
        subscription
    ) {
        var time = Number(
            subscription.updated_at ||
            subscription.created_at ||
            0
        );

        var files =
            Array.isArray(
                subscription.new_files
            )
                ? subscription.new_files
                : [];

        for (
            var i = 0;
            i < files.length;
            i++
        ) {
            var file =
                files[i] || {};

            var fileTime = Number(
                file.detected_at ||
                file.discovered_at ||
                file.added_at ||
                file.created_at ||
                file.updated_at ||
                0
            );

            if (fileTime > time) {
                time = fileTime;
            }
        }

        return time;
    }

    function sortSubscriptions(
        subscriptions
    ) {
        subscriptions.sort(
            function (
                first,
                second
            ) {
                refreshUpdateState(first);
                refreshUpdateState(second);

                var firstUpdate =
                    first.has_update
                        ? 1
                        : 0;

                var secondUpdate =
                    second.has_update
                        ? 1
                        : 0;

                if (
                    firstUpdate !==
                    secondUpdate
                ) {
                    return (
                        secondUpdate -
                        firstUpdate
                    );
                }

                var timeDifference =
                    getSubscriptionSortTime(
                        second
                    ) -
                    getSubscriptionSortTime(
                        first
                    );

                if (timeDifference) {
                    return timeDifference;
                }

                return String(
                    first.title || ''
                ).localeCompare(
                    String(
                        second.title || ''
                    )
                );
            }
        );

        return subscriptions;
    }

    function removeSubscription(cardData) {
        var subscriptions =
            getSubscriptions();

        var result = [];
        var removed = false;

        for (
            var i = 0;
            i < subscriptions.length;
            i++
        ) {
            var subscription =
                subscriptions[i];

            var sameId =
                cardData.series_notify_id &&
                subscription.id ===
                    cardData
                        .series_notify_id;

            var sameMovie =
                cardData.id !== null &&
                typeof cardData.id !==
                    'undefined' &&
                subscription.movie_id !== null &&
                typeof subscription.movie_id !==
                    'undefined' &&
                String(
                    subscription.movie_id
                ) ===
                String(cardData.id);

            if (sameId || sameMovie) {
                removed = true;
                continue;
            }

            result.push(subscription);
        }

        if (!removed) {
            log(
                'Карточка не найдена'
            );

            return false;
        }

        saveSubscriptions(result);
        updateIndicators();

        cardData.series_notify_deleted =
            true;

        log(
            'Сериал удалён'
        );

        return true;
    }

    function returnControllerToContent() {
        try {
            if (
                Lampa.Controller &&
                typeof Lampa.Controller.toggle ===
                    'function'
            ) {
                Lampa.Controller.toggle(
                    'content'
                );
            }
        } catch (error) {
            console.log(
                '[Series Notify] Ошибка возврата контроллера:',
                error
            );
        }
    }

    function confirmRemoveSubscription(
        cardData,
        card
    ) {
        if (
            cardData &&
            cardData.series_notify_deleted
        ) {
            log(
                'Сериал уже удалён'
            );

            return;
        }

        var title =
            cardData.title ||
            cardData.name ||
            'этот сериал';

        var deleting = false;

        function removeConfirmed() {
            if (deleting) {
                return;
            }

            deleting = true;

            returnControllerToContent();

            setTimeout(
                function () {
                    var removed =
                        removeSubscription(
                            cardData
                        );

                    if (
                        removed &&
                        card &&
                        typeof card.render ===
                            'function'
                    ) {
                        var rendered =
                            card.render();

                        if (
                            rendered &&
                            rendered.length
                        ) {
                            rendered.addClass(
                                'series-notify-card-deleted'
                            );
                        }
                    }

                    deleting = false;
                },
                150
            );
        }

        if (
            Lampa.Select &&
            typeof Lampa.Select.show ===
                'function'
        ) {
            Lampa.Select.show({
                title:
                    'Удалить «' +
                    title +
                    '»?',

                items: [
                    {
                        title:
                            'Удалить',

                        value:
                            'remove'
                    },
                    {
                        title:
                            'Отмена',

                        value:
                            'cancel'
                    }
                ],

                onSelect:
                    function (item) {
                        if (
                            item &&
                            item.value ===
                                'remove'
                        ) {
                            removeConfirmed();
                        } else {
                            returnControllerToContent();
                        }
                    },

                onBack:
                    function () {
                        returnControllerToContent();
                    }
            });

            return;
        }

        if (
            window.confirm &&
            window.confirm(
                'Удалить «' +
                title +
                '»?'
            )
        ) {
            removeConfirmed();
        }
    }

    function buildCards() {
        migrateAndDeduplicate();

        var subscriptions =
            sortSubscriptions(
                getSubscriptions()
            );

        var cards = [];

        for (
            var i = 0;
            i < subscriptions.length;
            i++
        ) {
            var subscription =
                refreshUpdateState(
                    subscriptions[i]
                );

            cards.push({
                id:
                    subscription.movie_id,

                title:
                    subscription.title,

                name:
                    subscription.title,

                original_title:
                    subscription
                        .original_title,

                original_name:
                    subscription
                        .original_title,

                poster_path:
                    subscription.poster,

                backdrop_path:
                    subscription.backdrop,

                media_type: 'tv',
                source: 'tmdb',

                series_notify: true,

                series_notify_id:
                    subscription.id,

                series_notify_has_update:
                    subscription
                        .has_update,

                series_notify_pending:
                    getPendingNewFiles(
                        subscription
                    ).length,

                series_notify_sort_time:
                    getSubscriptionSortTime(
                        subscription
                    )
            });
        }

        return cards;
    }

    function createComponent(object) {
        var component =
            new Lampa.InteractionCategory(
                object
            );

        component.create =
            function () {
                var cards =
                    buildCards();

                if (cards.length) {
                    this.build({
                        secuses: true,
                        page: 1,
                        total_pages: 1,
                        results: cards
                    });
                } else {
                    this.empty({
                        status: 404,
                        message:
                            'Подписок пока нет'
                    });
                }
            };

        component.nextPageReuest =
            function (
                request,
                resolve
            ) {
                resolve({
                    secuses: true,
                    page: 1,
                    total_pages: 1,
                    results: []
                });
            };

        component.cardRender =
            function (
                object,
                element,
                card
            ) {
                if (
                    card &&
                    typeof card.render ===
                        'function'
                ) {
                    var rendered =
                        card.render();

                    if (
                        rendered &&
                        rendered.length &&
                        element
                            .series_notify_has_update
                    ) {
                        rendered.addClass(
                            'series-notify-card-update'
                        );
                    }
                }

                card.onEnter =
                    function () {
                        openSavedTorrent(
                            element
                        );
                    };

                card.onMenu =
                    function () {
                        confirmRemoveSubscription(
                            element,
                            card
                        );
                    };
            };

        return component;
    }

    function createTopButton() {
        var button = $(
            '<div class="head__action selector ' +
            HEAD_CLASS +
            '">' +

            '<svg viewBox="0 0 24 24" ' +
            'fill="none" ' +
            'xmlns="http://www.w3.org/2000/svg">' +

            '<circle ' +
            'class="series-notify-active-background" ' +
            'cx="12" ' +
            'cy="12" ' +
            'r="10" ' +
            'fill="currentColor"/>' +

            '<path ' +
            'class="series-notify-star" ' +
            'd="M10.2 3.8' +
            'l1.55 3.14' +
            '3.47.5' +
            '-2.51 2.45' +
            '.59 3.45' +
            '-3.1-1.63' +
            '-3.1 1.63' +
            '.59-3.45' +
            '-2.51-2.45' +
            '3.47-.5' +
            'L10.2 3.8Z" ' +
            'fill="none" ' +
            'stroke="currentColor" ' +
            'stroke-width="1.7" ' +
            'stroke-linejoin="round"/>' +

            '<path ' +
            'class="series-notify-plus" ' +
            'd="M17.5 14.5V20.5" ' +
            'stroke="currentColor" ' +
            'stroke-width="2" ' +
            'stroke-linecap="round"/>' +

            '<path ' +
            'class="series-notify-plus" ' +
            'd="M14.5 17.5H20.5" ' +
            'stroke="currentColor" ' +
            'stroke-width="2" ' +
            'stroke-linecap="round"/>' +

            '</svg>' +

            '<div class="series-notify-head-counter">0</div>' +

            '</div>'
        );

        button.on(
            'hover:enter',
            openUpdates
        );

        return button;
    }

    function ensureTopButton() {
        var actions =
            $('.head__actions');

        if (!actions.length) {
            return false;
        }

        if (
            !$('.' + HEAD_CLASS).length
        ) {
            actions.prepend(
                createTopButton()
            );
        }

        updateIndicators();

        return true;
    }

    function watchTopPanel() {
        if (headTimer) {
            clearInterval(
                headTimer
            );
        }

        headTimer =
            setInterval(
                ensureTopButton,
                1000
            );

        if (
            window.MutationObserver &&
            !headObserver
        ) {
            headObserver =
                new MutationObserver(
                    function () {
                        if (
                            !$('.' +
                                HEAD_CLASS
                            ).length
                        ) {
                            ensureTopButton();
                        }
                    }
                );

            headObserver.observe(
                document.body,
                {
                    childList: true,
                    subtree: true
                }
            );
        }

        ensureTopButton();
    }

    function createMenuIcon() {
        return (
            '<svg viewBox="0 0 24 24" ' +
            'fill="none" ' +
            'xmlns="http://www.w3.org/2000/svg">' +

            '<path ' +
            'd="M10.2 3.8' +
            'l1.55 3.14' +
            '3.47.5' +
            '-2.51 2.45' +
            '.59 3.45' +
            '-3.1-1.63' +
            '-3.1 1.63' +
            '.59-3.45' +
            '-2.51-2.45' +
            '3.47-.5' +
            'L10.2 3.8Z" ' +
            'fill="none" ' +
            'stroke="currentColor" ' +
            'stroke-width="1.7" ' +
            'stroke-linejoin="round"/>' +

            '<path ' +
            'd="M17.5 14.5V20.5" ' +
            'stroke="currentColor" ' +
            'stroke-width="2" ' +
            'stroke-linecap="round"/>' +

            '<path ' +
            'd="M14.5 17.5H20.5" ' +
            'stroke="currentColor" ' +
            'stroke-width="2" ' +
            'stroke-linecap="round"/>' +

            '</svg>'
        );
    }

    function addMenuItem() {
        if (
            $('.' + MENU_CLASS).length
        ) {
            updateIndicators();
            return;
        }

        var button = $(
            '<li class="menu__item selector ' +
            MENU_CLASS +
            '">' +

            '<div class="menu__ico">' +
            createMenuIcon() +
            '</div>' +

            '<div class="menu__text">' +
            getMenuTitle() +
            '</div>' +

            '</li>'
        );

        button.on(
            'hover:enter',
            openUpdates
        );

        $('.menu .menu__list')
            .eq(0)
            .append(button);

        updateIndicators();
    }

    function startPlugin() {
        if (
            window.seriesNotifyStarted
        ) {
            return;
        }

        window.seriesNotifyStarted =
            true;

        Lampa.Manifest.plugins =
            manifest;

        migrateAndDeduplicate();
        addStyles();

        Lampa.Component.add(
            COMPONENT_NAME,
            createComponent
        );

        installTorrentStartCapture();

        var captureAttempts = 0;

        var captureTimer =
            setInterval(
                function () {
                    captureAttempts++;

                    if (
                        installTorrentStartCapture() ||
                        captureAttempts >= 30
                    ) {
                        clearInterval(
                            captureTimer
                        );
                    }
                },
                500
            );

        addMenuItem();
        watchTopPanel();

        Lampa.Listener.follow(
            'torrent_file',
            function (event) {
                if (
                    !event ||
                    event.type !==
                        'onenter'
                ) {
                    return;
                }

                saveSubscription(event);
            }
        );

        if (
            Lampa.Player &&
            Lampa.Player.listener &&
            typeof Lampa.Player
                .listener.follow ===
                'function'
        ) {
            Lampa.Player
                .listener.follow(
                    'start',
                    handlePlayerStart
                );
        }

        Lampa.Listener.follow(
            'app',
            function () {
                installTorrentStartCapture();

                setTimeout(
                    ensureTopButton,
                    300
                );
            }
        );

        updateIndicators();

        log(
            'Версия 1.0.12 запущена'
        );
    }

    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow(
            'app',
            function (event) {
                if (
                    event.type ===
                        'ready'
                ) {
                    startPlugin();
                }
            }
        );
    }
})();