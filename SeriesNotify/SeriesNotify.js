(function () {
    'use strict';

    var STORAGE_KEY =
        'series_notify_subscriptions';

    var COMPONENT_NAME =
        'series_notify';

    var MENU_CLASS =
        'series-notify-menu-item';

    var HEAD_CLASS =
        'series-notify-head-button';

    var STYLE_ID =
        'series-notify-styles';

    var headObserver = null;
    var headTimer = null;

    var manifest = {
        type: 'video',
        version: '0.9.0',
        name: 'Series Notify',
        description:
            'Уведомления о новых сериях',
        component: COMPONENT_NAME
    };

    function getSubscriptions() {
        var subscriptions =
            Lampa.Storage.get(
                STORAGE_KEY,
                []
            );

        if (
            typeof subscriptions ===
            'string'
        ) {
            try {
                subscriptions =
                    JSON.parse(
                        subscriptions
                    );
            } catch (error) {
                subscriptions = [];
            }
        }

        return Array.isArray(
            subscriptions
        )
            ? subscriptions
            : [];
    }

    function saveSubscriptions(
        subscriptions
    ) {
        Lampa.Storage.set(
            STORAGE_KEY,
            subscriptions
        );
    }

    function getSubscriptionId(data) {
        return [
            data.movie_id ||
                data.title ||
                'unknown',

            data.torrent_hash ||
                data.torrent_title ||
                'unknown'
        ].join('_');
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

    function normalizeTorrentFiles(
        items
    ) {
        var files = [];

        if (!Array.isArray(items)) {
            return files;
        }

        for (
            var i = 0;
            i < items.length;
            i++
        ) {
            var item = items[i] || {};
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

    function getPendingNewFiles(
        subscription
    ) {
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
                pending.push(files[i]);
            }
        }

        return pending;
    }

    function refreshUpdateState(
        subscription
    ) {
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

        var playerPath = String(
            playerData.path ||
            playerData.file ||
            ''
        ).toLowerCase();

        var newPath = String(
            newFile.path || ''
        ).toLowerCase();

        if (
            playerPath &&
            newPath &&
            playerPath === newPath
        ) {
            return true;
        }

        return false;
    }

    function handlePlayerStart(
        playerData
    ) {
        if (
            !playerData ||
            !playerData.torrent_hash
        ) {
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
                subscription
                    .torrent_hash !==
                playerData.torrent_hash
            ) {
                continue;
            }

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
                subscription.updated_at =
                    Date.now();

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

        console.log(
            '[Series Notify] Серия передана в плеер:',
            playerData
        );
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

            '</style>'
        );

        $('head').append(styles);
    }

    function openUpdates() {
        Lampa.Activity.push({
            url: '',
            title: 'Series Notify',
            component:
                COMPONENT_NAME,
            page: 1
        });
    }

    function updateIndicators() {
        var count =
            getNotificationCount();

        $('.' +
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

    function createMovieObject(
        subscription
    ) {
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

    function openSavedTorrent(
        cardData
    ) {
        var subscription =
            findSubscription(
                cardData
                    .series_notify_id
            );

        if (!subscription) {
            Lampa.Noty.show(
                'Series Notify: подписка не найдена'
            );

            return;
        }

        if (
            !subscription
                .torrent_hash
        ) {
            Lampa.Noty.show(
                'Series Notify: у подписки нет hash торрента'
            );

            return;
        }

        if (
            !Lampa.Torrent ||
            typeof Lampa.Torrent.open !==
                'function'
        ) {
            Lampa.Noty.show(
                'Series Notify: открытие торрента недоступно'
            );

            return;
        }

        var movie =
            createMovieObject(
                subscription
            );

        console.log(
            '[Series Notify] Открываем раздачу:',
            subscription
                .torrent_hash
        );

        /*
         * Здесь больше нет
         * markSubscriptionRead().
         *
         * Открытие раздачи,
         * ошибка или тайм-аут
         * ничего не сбрасывают.
         */
        Lampa.Torrent.open(
            subscription
                .torrent_hash,
            movie
        );
    }

    function saveSubscription(
        event
    ) {
        var file =
            event.element || {};

        var params =
            event.params || {};

        var movie =
            params.movie || {};

        var currentFiles =
            normalizeTorrentFiles(
                event.items || []
            );

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

            torrent_hash:
                file.torrent_hash ||
                file.hash ||
                '',

            torrent_title:
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

            updated_at:
                Date.now()
        };

        subscription.id =
            getSubscriptionId(
                subscription
            );

        var subscriptions =
            getSubscriptions();

        var existingIndex = -1;

        for (
            var i = 0;
            i < subscriptions.length;
            i++
        ) {
            if (
                subscriptions[i].id ===
                subscription.id
            ) {
                existingIndex = i;
                break;
            }
        }

        if (existingIndex >= 0) {
            var existing =
                subscriptions[
                    existingIndex
                ];

            subscription.created_at =
                existing.created_at ||
                Date.now();

            subscription.new_files =
                Array.isArray(
                    existing.new_files
                )
                    ? existing.new_files
                    : [];

            subscription.read_at =
                existing.read_at ||
                null;

            refreshUpdateState(
                subscription
            );

            subscriptions[
                existingIndex
            ] = subscription;

            Lampa.Noty.show(
                'Series Notify: подписка обновлена (' +
                subscriptions.length +
                ')'
            );
        } else {
            subscription.created_at =
                Date.now();

            subscriptions.push(
                subscription
            );

            Lampa.Noty.show(
                'Series Notify: подписка сохранена (' +
                subscriptions.length +
                ')'
            );
        }

        saveSubscriptions(
            subscriptions
        );

        updateIndicators();

        console.log(
            '[Series Notify] Сохранена раздача:',
            subscription
        );
    }

    function buildCards() {
        var subscriptions =
            getSubscriptions();

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
                    subscription
                        .movie_id,

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

                series_notify_hash:
                    subscription
                        .torrent_hash,

                series_notify_torrent:
                    subscription
                        .torrent_title,

                series_notify_has_update:
                    subscription
                        .has_update,

                series_notify_new_episode:
                    subscription
                        .new_episode,

                series_notify_pending:
                    getPendingNewFiles(
                        subscription
                    ).length
            });
        }

        return cards;
    }

    function createComponent(
        object
    ) {
        var component =
            new Lampa
                .InteractionCategory(
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

                '<div class="series-notify-head-counter">' +
                    '0' +
                '</div>' +

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
            !$('.' + HEAD_CLASS)
                .length
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
            window
                .MutationObserver &&
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
            $('.' + MENU_CLASS)
                .length
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
            window
                .seriesNotifyStarted
        ) {
            return;
        }

        window
            .seriesNotifyStarted =
            true;

        Lampa.Manifest.plugins =
            manifest;

        addStyles();

        Lampa.Component.add(
            COMPONENT_NAME,
            createComponent
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

                saveSubscription(
                    event
                );
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
                setTimeout(
                    ensureTopButton,
                    300
                );
            }
        );

        updateIndicators();

        Lampa.Noty.show(
            'Series Notify запущен. Подписок: ' +
            getSubscriptions().length
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