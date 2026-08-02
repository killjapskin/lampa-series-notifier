(function () {
    'use strict';

    var STORAGE_KEY = 'series_notify_subscriptions';
    var COMPONENT_NAME = 'series_notify';
    var MENU_CLASS = 'series-notify-menu-item';
    var HEAD_CLASS = 'series-notify-head-button';
    var STYLE_ID = 'series-notify-styles';
    var FIRST_CHECK_DELAY = 0;
    var CHECK_INTERVAL = 6 * 60 * 60 * 1000;
    var SEARCH_STEP_DELAY = 800;

    var pendingTorrent = null;
    var pendingMovie = null;
    var pendingSeason = null;
    var checking = false;
    var checkTimer = null;
    var headTimer = null;
    var headObserver = null;

    var manifest = {
        type: 'video',
        version: '1.1.4',
        name: 'Series Notify',
        description: 'Уведомления о новых сериях и сезонах',
        component: COMPONENT_NAME
    };

    function log() {
        try {
            var args =
                Array.prototype.slice.call(
                    arguments
                );

            args.unshift(
                '[Series Notify]'
            );

            console.log.apply(
                console,
                args
            );
        } catch (error) {}
    }

    function clone(value, depth) {
        depth =
            typeof depth === 'number'
                ? depth
                : 0;

        if (
            depth > 10 ||
            typeof value === 'function' ||
            typeof value === 'undefined'
        ) {
            return null;
        }

        if (
            value === null ||
            typeof value !== 'object'
        ) {
            return value;
        }

        if (Array.isArray(value)) {
            var arrayResult = [];

            for (
                var i = 0;
                i < value.length;
                i++
            ) {
                var copiedItem =
                    clone(
                        value[i],
                        depth + 1
                    );

                if (copiedItem !== null) {
                    arrayResult.push(
                        copiedItem
                    );
                }
            }

            return arrayResult;
        }

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
                var copiedValue =
                    clone(
                        value[key],
                        depth + 1
                    );

                if (copiedValue !== null) {
                    objectResult[key] =
                        copiedValue;
                }
            } catch (error) {}
        }

        return objectResult;
    }

    function text(value) {
        return String(value || '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    function read() {
        var list =
            Lampa.Storage.get(
                STORAGE_KEY,
                []
            );

        if (typeof list === 'string') {
            try {
                list = JSON.parse(list);
            } catch (error) {
                list = [];
            }
        }

        return Array.isArray(list)
            ? list
            : [];
    }

    function write(list) {
        Lampa.Storage.set(
            STORAGE_KEY,
            list
        );
    }

    function torrentTitle(item) {
        item = item || {};

        return (
            item.Title ||
            item.title ||
            item.Name ||
            item.name ||
            ''
        );
    }

    function torrentLink(item) {
        item = item || {};

        return (
            item.MagnetUri ||
            item.magnetUri ||
            item.magnet ||
            item.Link ||
            item.link ||
            item.Url ||
            item.url ||
            ''
        );
    }

    function torrentTracker(item) {
        item = item || {};

        return (
            item.Tracker ||
            item.tracker ||
            item.TrackerName ||
            item.tracker_name ||
            item.Source ||
            item.source ||
            ''
        );
    }

    function movieKey(item) {
        if (!item) {
            return '';
        }

        if (
            item.movie_id !== null &&
            typeof item.movie_id !==
                'undefined'
        ) {
            return (
                'id:' +
                String(item.movie_id)
            );
        }

        return (
            'title:' +
            text(item.title)
        );
    }

    function subscriptionId(item) {
        return [
            item.movie_id ||
                item.title ||
                'unknown',

            item.torrent_link ||
                item.torrent_hash ||
                item.torrent_title ||
                'unknown'
        ].join('_');
    }

    function positiveNumber(value) {
        if (
            value === null ||
            typeof value === 'undefined'
        ) {
            return 0;
        }

        var string =
            String(value)
                .toLowerCase()
                .trim();

        if (
            !string ||
            string === '0' ||
            string === '00' ||
            string === '-' ||
            string === 'null' ||
            string === 'undefined'
        ) {
            return 0;
        }

        var number =
            Number(string);

        if (
            isNaN(number) ||
            number < 1
        ) {
            return 0;
        }

        return number;
    }

    function uniqueNumbers(values) {
        var result = [];
        var used = {};

        values =
            Array.isArray(values)
                ? values
                : [];

        for (
            var i = 0;
            i < values.length;
            i++
        ) {
            var number =
                parseInt(
                    values[i],
                    10
                );

            if (
                !number ||
                number < 1 ||
                used[number]
            ) {
                continue;
            }

            used[number] = true;
            result.push(number);
        }

        result.sort(
            function (first, second) {
                return first - second;
            }
        );

        return result;
    }

    function seasonRange(
        value,
        file,
        files
    ) {
        var source =
            String(value || '')
                .replace(/[._]+/g, ' ')
                .replace(/–|—/g, '-');

        var seasons = [];
        var match;

        var rangePatterns = [
            /\bS(?:eason)?\s*0*(\d{1,3})\s*-\s*S?0*(\d{1,3})\b/ig,
            /\bсезон(?:ы|а)?\s*0*(\d{1,3})\s*-\s*0*(\d{1,3})\b/ig
        ];

        var singlePatterns = [
            /\bS(?:eason)?\s*0*(\d{1,3})\b/ig,
            /\bсезон(?:а)?\s*0*(\d{1,3})\b/ig
        ];

        for (
            var i = 0;
            i < rangePatterns.length;
            i++
        ) {
            while (
                (
                    match =
                        rangePatterns[i]
                            .exec(source)
                )
            ) {
                var start =
                    parseInt(
                        match[1],
                        10
                    );

                var end =
                    parseInt(
                        match[2],
                        10
                    );

                if (end < start) {
                    var swap = start;

                    start = end;
                    end = swap;
                }

                for (
                    var season = start;
                    season <= end &&
                    season - start < 100;
                    season++
                ) {
                    seasons.push(season);
                }
            }
        }

        for (
            var j = 0;
            j < singlePatterns.length;
            j++
        ) {
            while (
                (
                    match =
                        singlePatterns[j]
                            .exec(source)
                )
            ) {
                seasons.push(
                    parseInt(
                        match[1],
                        10
                    )
                );
            }
        }

        file = file || {};

        if (
            positiveNumber(
                file.season
            )
        ) {
            seasons.push(
                positiveNumber(
                    file.season
                )
            );
        }

        files =
            Array.isArray(files)
                ? files
                : [];

        for (
            var k = 0;
            k < files.length;
            k++
        ) {
            if (
                positiveNumber(
                    files[k].season
                )
            ) {
                seasons.push(
                    positiveNumber(
                        files[k].season
                    )
                );
            }
        }

        seasons =
            uniqueNumbers(seasons);

        if (!seasons.length) {
            return null;
        }

        return {
            start: seasons[0],

            end:
                seasons[
                    seasons.length - 1
                ],

            seasons: seasons
        };
    }

    function seasonLabel(range) {
        if (!range) {
            return 'Сезон';
        }

        if (
            Number(range.start) ===
            Number(range.end)
        ) {
            return (
                'S' +
                Number(range.start)
            );
        }

        return (
            'S' +
            Number(range.start) +
            '–S' +
            Number(range.end)
        );
    }

    function resolution(value) {
        var match =
            String(value || '')
                .match(
                    /\b(2160p|1080p|1080i|720p|576p|480p|4k|uhd)\b/i
                );

        if (!match) {
            return '';
        }

        return match[1]
            .toLowerCase()
            .replace(
                '4k',
                '2160p'
            )
            .replace(
                'uhd',
                '2160p'
            );
    }

    function releaseGroup(value) {
        var source =
            String(value || '');

        var found = [];
        var match;

        var pattern =
            /[\[(]([^\])]+)[\])]/g;

        while (
            (
                match =
                    pattern.exec(source)
            )
        ) {
            var part =
                text(match[1]);

            if (
                !part ||
                resolution(part)
            ) {
                continue;
            }

            if (
                /^(web[- .]?dl|webrip|bluray|bdrip|hdtv|dvdrip|hdr|sdr)$/i
                    .test(part)
            ) {
                continue;
            }

            if (
                /^\d+(?:\.\d+)?\s*(gb|mb|гб|мб)$/i
                    .test(part)
            ) {
                continue;
            }

            found.push(part);
        }

        return found.length
            ? found[found.length - 1]
            : '';
    }

    function uploader(item) {
        item = item || {};

        var keys = [
            'Uploader',
            'uploader',
            'Author',
            'author',
            'User',
            'user',
            'Username',
            'username',
            'CreatedBy',
            'created_by'
        ];

        for (
            var i = 0;
            i < keys.length;
            i++
        ) {
            if (item[keys[i]]) {
                return text(
                    item[keys[i]]
                );
            }
        }

        return '';
    }

    function baseTitle(value) {
        return text(value)
            .replace(
                /\bS(?:eason)?\s*\d{1,3}(?:\s*-\s*S?\d{1,3})?\b/ig,
                ' '
            )
            .replace(
                /\bсезон(?:ы|а)?\s*\d{1,3}(?:\s*-\s*\d{1,3})?\b/ig,
                ' '
            )
            .replace(
                /\bS\d{1,3}E\d{1,4}\b/ig,
                ' '
            )
            .replace(
                /\b\d{1,3}x\d{1,4}\b/ig,
                ' '
            )
            .replace(
                /\b(2160p|1080p|1080i|720p|576p|480p|4k|uhd)\b/ig,
                ' '
            )
            .replace(
                /[\[\](){}._-]+/g,
                ' '
            )
            .replace(
                /\s+/g,
                ' '
            )
            .trim();
    }

    function profile(item) {
        var title =
            torrentTitle(item);

        return {
            base:
                baseTitle(title),

            resolution:
                resolution(title),

            group:
                releaseGroup(title),

            uploader:
                uploader(item),

            tracker:
                text(
                    torrentTracker(item)
                )
        };
    }

    function profileMatches(
        candidate,
        reference
    ) {
        candidate =
            candidate || {};

        reference =
            reference || {};

        if (
            candidate.resolution &&
            reference.resolution &&
            candidate.resolution !==
                reference.resolution
        ) {
            return false;
        }

        if (
            candidate.uploader &&
            reference.uploader &&
            candidate.uploader !==
                reference.uploader
        ) {
            return false;
        }

        if (
            candidate.group &&
            reference.group &&
            candidate.group !==
                reference.group
        ) {
            return false;
        }

        if (
            candidate.base &&
            reference.base &&
            candidate.base !==
                reference.base &&
            candidate.base.indexOf(
                reference.base
            ) < 0 &&
            reference.base.indexOf(
                candidate.base
            ) < 0
        ) {
            return false;
        }

        return !!(
            candidate.resolution ||
            candidate.group ||
            candidate.uploader
        );
    }

    function seriesMarker(value) {
        var source =
            String(value || '')
                .replace(
                    /[._-]+/g,
                    ' '
                );

        return (
            /\bS\d{1,3}E\d{1,4}\b/i
                .test(source) ||

            /\b\d{1,3}\s*x\s*\d{1,4}\b/i
                .test(source) ||

            /\bseason\s*\d{1,3}\b/i
                .test(source) ||

            /\bepisodes?\s*\d{1,4}\b/i
                .test(source) ||

            /\bсезон(?:а)?\s*\d{1,3}\b/i
                .test(source) ||

            /\bсер(?:ия|ии|ий)\s*\d{1,4}\b/i
                .test(source)
        );
    }

    function isSeries(
        torrent,
        file,
        files
    ) {
        file = file || {};

        if (
            positiveNumber(
                file.season
            ) ||
            positiveNumber(
                file.episode
            )
        ) {
            return true;
        }

        files =
            Array.isArray(files)
                ? files
                : [];

        for (
            var i = 0;
            i < files.length;
            i++
        ) {
            if (
                positiveNumber(
                    files[i].season
                ) ||
                positiveNumber(
                    files[i].episode
                ) ||
                seriesMarker(
                    files[i].path
                ) ||
                seriesMarker(
                    files[i].title
                )
            ) {
                return true;
            }
        }

        var values = [
            torrentTitle(torrent),
            file.path,
            file.file,
            file.title,
            file.name,
            file.path_human,
            file.first_title
        ];

        for (
            var j = 0;
            j < values.length;
            j++
        ) {
            if (
                seriesMarker(
                    values[j]
                )
            ) {
                return true;
            }
        }

        return false;
    }

    function normalizeFiles(items) {
        items =
            Array.isArray(items)
                ? items
                : [];

        var files = [];

        for (
            var i = 0;
            i < items.length;
            i++
        ) {
            var item =
                items[i] || {};

            var key = [
                String(
                    item.path ||
                    item.file ||
                    item.name ||
                    item.title ||
                    ''
                ).toLowerCase(),

                item.season || '',
                item.episode || ''
            ].join('|');

            if (key === '||') {
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

    function ensureSeasonData(item) {
        if (
            !Array.isArray(
                item.season_torrents
            )
        ) {
            item.season_torrents = [];
        }

        if (
            !Array.isArray(
                item.missing_seasons
            )
        ) {
            item.missing_seasons = [];
        }

        if (
            !Array.isArray(
                item.new_files
            )
        ) {
            item.new_files = [];
        }

        if (
            typeof item.unseen_update !==
            'boolean'
        ) {
            item.unseen_update = false;
        }

        if (
            !item.season_torrents.length &&
            item.torrent_object
        ) {
            var range =
                seasonRange(
                    item.torrent_title ||
                    torrentTitle(
                        item.torrent_object
                    ),
                    {
                        season:
                            item.season
                    },
                    item.current_files
                );

            if (range) {
                item.season_torrents.push({
                    range: range,

                    label:
                        seasonLabel(range),

                    torrent_object:
                        clone(
                            item.torrent_object
                        ),

                    profile:
                        profile(
                            item.torrent_object
                        ),

                    added_at:
                        item.updated_at ||
                        item.created_at ||
                        Date.now(),

                    is_new: false,
                    manual: false
                });
            }
        }

        return item;
    }

    function knownSeasons(item) {
        ensureSeasonData(item);

        var values = [];

        for (
            var i = 0;
            i < item.season_torrents.length;
            i++
        ) {
            var entry =
                item.season_torrents[i];

            if (
                entry.range &&
                Array.isArray(
                    entry.range.seasons
                )
            ) {
                values =
                    values.concat(
                        entry.range.seasons
                    );
            }
        }

        return uniqueNumbers(values);
    }

    function maximumKnownSeason(item) {
        var known =
            knownSeasons(item);

        var maximum =
            known.length
                ? known[
                    known.length - 1
                ]
                : 0;

        return Math.max(
            maximum,
            Number(
                item.season_ceiling ||
                0
            )
        );
    }

    function seasonEntryKey(entry) {
        return [
            entry &&
            entry.range
                ? entry.range.start
                : 0,

            entry &&
            entry.range
                ? entry.range.end
                : 0,

            torrentLink(
                entry &&
                entry.torrent_object
            ) ||
            torrentTitle(
                entry &&
                entry.torrent_object
            )
        ].join('|');
    }

    function saveSeasonEntry(
        item,
        entry
    ) {
        ensureSeasonData(item);

        if (
            !entry ||
            !entry.range ||
            !entry.torrent_object
        ) {
            return;
        }

        var key =
            seasonEntryKey(entry);

        var replaced = false;

        for (
            var i = 0;
            i < item.season_torrents.length;
            i++
        ) {
            if (
                seasonEntryKey(
                    item.season_torrents[i]
                ) === key
            ) {
                entry.added_at =
                    item.season_torrents[i]
                        .added_at ||
                    entry.added_at ||
                    Date.now();

                entry.is_new =
                    !!entry.is_new ||
                    !!item.season_torrents[i]
                        .is_new;

                item.season_torrents[i] =
                    entry;

                replaced = true;
                break;
            }
        }

        if (!replaced) {
            item.season_torrents.push(
                entry
            );
        }

        item.season_torrents.sort(
            function (first, second) {
                var firstStart =
                    first.range
                        ? first.range.start
                        : 0;

                var secondStart =
                    second.range
                        ? second.range.start
                        : 0;

                if (
                    firstStart !==
                    secondStart
                ) {
                    return (
                        firstStart -
                        secondStart
                    );
                }

                var firstSpan =
                    first.range
                        ? first.range.end -
                            first.range.start
                        : 999;

                var secondSpan =
                    second.range
                        ? second.range.end -
                            second.range.start
                        : 999;

                return (
                    firstSpan -
                    secondSpan
                );
            }
        );

        if (
            entry.range &&
            Array.isArray(
                entry.range.seasons
            )
        ) {
            item.missing_seasons =
                item.missing_seasons
                    .filter(
                        function (season) {
                            return (
                                entry.range.seasons
                                    .indexOf(
                                        Number(season)
                                    ) < 0
                            );
                        }
                    );
        }

        item.torrent_object =
            clone(
                entry.torrent_object
            );

        item.torrent_title =
            torrentTitle(
                entry.torrent_object
            );

        item.torrent_link =
            torrentLink(
                entry.torrent_object
            );

        item.torrent_tracker =
            torrentTracker(
                entry.torrent_object
            );

        item.updated_at =
            Date.now();
    }
        function entryContainsSeason(
        entry,
        season
    ) {
        if (
            !entry ||
            !entry.range
        ) {
            return false;
        }

        if (
            Array.isArray(
                entry.range.seasons
            )
        ) {
            return (
                entry.range.seasons
                    .indexOf(
                        Number(season)
                    ) >= 0
            );
        }

        return (
            Number(season) >=
                Number(
                    entry.range.start
                ) &&
            Number(season) <=
                Number(
                    entry.range.end
                )
        );
    }

    function entrySpan(entry) {
        if (
            !entry ||
            !entry.range
        ) {
            return 999;
        }

        return (
            Number(
                entry.range.end
            ) -
            Number(
                entry.range.start
            )
        );
    }

    function bestEntryForSeason(
        item,
        season
    ) {
        ensureSeasonData(item);

        var candidates = [];

        for (
            var i = 0;
            i < item.season_torrents.length;
            i++
        ) {
            if (
                entryContainsSeason(
                    item.season_torrents[i],
                    season
                )
            ) {
                candidates.push(
                    item.season_torrents[i]
                );
            }
        }

        candidates.sort(
            function (first, second) {
                var firstExact =
                    entrySpan(first) === 0
                        ? 1
                        : 0;

                var secondExact =
                    entrySpan(second) === 0
                        ? 1
                        : 0;

                if (
                    firstExact !==
                    secondExact
                ) {
                    return (
                        secondExact -
                        firstExact
                    );
                }

                var spanDifference =
                    entrySpan(first) -
                    entrySpan(second);

                if (spanDifference) {
                    return spanDifference;
                }

                if (
                    !!first.manual !==
                    !!second.manual
                ) {
                    return first.manual
                        ? -1
                        : 1;
                }

                return (
                    Number(
                        second.added_at ||
                        0
                    ) -
                    Number(
                        first.added_at ||
                        0
                    )
                );
            }
        );

        return candidates.length
            ? candidates[0]
            : null;
    }

    function rebuildMissingSeasons(
        item,
        maximum
    ) {
        ensureSeasonData(item);

        maximum =
            Number(
                maximum ||
                maximumKnownSeason(item)
            );

        var missing = [];

        for (
            var season = 1;
            season <= maximum;
            season++
        ) {
            if (
                !bestEntryForSeason(
                    item,
                    season
                )
            ) {
                missing.push(season);
            }
        }

        item.missing_seasons =
            missing;
    }

    function updateState(item) {
        ensureSeasonData(item);

        item.has_update =
            !!item.unseen_update;

        return item;
    }

    function markItemViewed(item) {
        ensureSeasonData(item);

        item.unseen_update =
            false;

        item.viewed_at =
            Date.now();

        for (
            var i = 0;
            i < item.season_torrents.length;
            i++
        ) {
            item.season_torrents[i]
                .is_new = false;
        }

        updateState(item);
        saveItem(item);
        updateIndicators();
    }

    function movieSeasonCount(movie) {
        movie = movie || {};

        var maximum =
            positiveNumber(
                movie.number_of_seasons
            );

        if (
            Array.isArray(
                movie.seasons
            )
        ) {
            for (
                var i = 0;
                i < movie.seasons.length;
                i++
            ) {
                var number =
                    positiveNumber(
                        movie.seasons[i]
                            .season_number
                    );

                if (number > maximum) {
                    maximum = number;
                }
            }
        }

        return maximum;
    }

    function setManualReference(
        item,
        entry
    ) {
        ensureSeasonData(item);

        entry.manual = true;
        entry.is_new = false;

        entry.added_at =
            entry.added_at ||
            Date.now();

        item.season_torrents = [
            entry
        ];

        item.reference_torrent =
            clone(
                entry.torrent_object
            );

        item.reference_profile =
            profile(
                entry.torrent_object
            );

        item.reference_range =
            clone(
                entry.range
            );

        item.reference_updated_at =
            Date.now();

        item.catalog_initialized =
            false;

        item.unseen_update =
            false;

        item.season_ceiling =
            Math.max(
                Number(
                    item.season_ceiling ||
                    0
                ),

                Number(
                    entry.range.end ||
                    0
                ),

                movieSeasonCount(
                    item.movie_object
                )
            );

        rebuildMissingSeasons(
            item,
            item.season_ceiling
        );

        item.torrent_object =
            clone(
                entry.torrent_object
            );

        item.torrent_title =
            torrentTitle(
                entry.torrent_object
            );

        item.torrent_link =
            torrentLink(
                entry.torrent_object
            );

        item.torrent_tracker =
            torrentTracker(
                entry.torrent_object
            );

        item.updated_at =
            Date.now();

        updateState(item);
    }

    function getReferenceProfile(item) {
        ensureSeasonData(item);

        if (
            item.reference_profile
        ) {
            return item.reference_profile;
        }

        if (
            item.reference_torrent
        ) {
            item.reference_profile =
                profile(
                    item.reference_torrent
                );

            return item.reference_profile;
        }

        if (
            item.season_torrents.length
        ) {
            var latest =
                item.season_torrents[
                    item.season_torrents.length -
                    1
                ];

            item.reference_torrent =
                clone(
                    latest.torrent_object
                );

            item.reference_profile =
                latest.profile ||
                profile(
                    latest.torrent_object
                );

            return item.reference_profile;
        }

        return null;
    }

    function migrate() {
        var map = {};
        var order = [];
        var list = read();

        for (
            var i = 0;
            i < list.length;
            i++
        ) {
            var item =
                list[i];

            if (!item) {
                continue;
            }

            ensureSeasonData(item);

            if (
                typeof item.catalog_initialized !==
                'boolean'
            ) {
                item.catalog_initialized =
                    false;
            }

            item.season_ceiling =
                Math.max(
                    Number(
                        item.season_ceiling ||
                        0
                    ),

                    maximumKnownSeason(item),

                    movieSeasonCount(
                        item.movie_object
                    )
                );

            if (
                !item.reference_torrent &&
                item.season_torrents.length
            ) {
                var latest =
                    item.season_torrents[
                        item.season_torrents.length -
                        1
                    ];

                item.reference_torrent =
                    clone(
                        latest.torrent_object
                    );

                item.reference_profile =
                    latest.profile ||
                    profile(
                        latest.torrent_object
                    );
            }

            rebuildMissingSeasons(
                item,
                item.season_ceiling
            );

            var key =
                movieKey(item);

            if (!key) {
                continue;
            }

            if (!map[key]) {
                map[key] = item;
                order.push(key);
                continue;
            }

            var target =
                map[key];

            for (
                var j = 0;
                j < item.season_torrents.length;
                j++
            ) {
                saveSeasonEntry(
                    target,
                    clone(
                        item.season_torrents[j]
                    )
                );
            }

            if (
                Number(
                    item.reference_updated_at ||
                    0
                ) >
                Number(
                    target.reference_updated_at ||
                    0
                )
            ) {
                target.reference_torrent =
                    clone(
                        item.reference_torrent
                    );

                target.reference_profile =
                    clone(
                        item.reference_profile
                    );

                target.reference_range =
                    clone(
                        item.reference_range
                    );

                target.reference_updated_at =
                    item.reference_updated_at;
            }

            target.season_ceiling =
                Math.max(
                    Number(
                        target.season_ceiling ||
                        0
                    ),

                    Number(
                        item.season_ceiling ||
                        0
                    )
                );

            target.unseen_update =
                !!target.unseen_update ||
                !!item.unseen_update;

            if (
                Number(
                    item.updated_at ||
                    0
                ) >
                Number(
                    target.updated_at ||
                    0
                )
            ) {
                var fields = [
                    'movie_object',
                    'torrent_object',
                    'torrent_title',
                    'torrent_link',
                    'torrent_tracker',
                    'current_files',
                    'season',
                    'episode'
                ];

                for (
                    var k = 0;
                    k < fields.length;
                    k++
                ) {
                    if (
                        item[
                            fields[k]
                        ]
                    ) {
                        target[
                            fields[k]
                        ] =
                            clone(
                                item[
                                    fields[k]
                                ]
                            );
                    }
                }

                target.updated_at =
                    item.updated_at;
            }

            rebuildMissingSeasons(
                target,
                target.season_ceiling
            );
        }

        var result = [];

        for (
            var m = 0;
            m < order.length;
            m++
        ) {
            var current =
                map[
                    order[m]
                ];

            updateState(current);
            result.push(current);
        }

        write(result);

        return result;
    }

    function findById(id) {
        var list = read();

        for (
            var i = 0;
            i < list.length;
            i++
        ) {
            if (
                list[i].id === id
            ) {
                return list[i];
            }
        }

        return null;
    }

    function findByMovie(
        movieId,
        title
    ) {
        var list = read();

        for (
            var i = 0;
            i < list.length;
            i++
        ) {
            if (
                movieId !== null &&
                typeof movieId !==
                    'undefined' &&
                list[i].movie_id !== null &&
                typeof list[i].movie_id !==
                    'undefined'
            ) {
                if (
                    String(
                        list[i].movie_id
                    ) ===
                    String(movieId)
                ) {
                    return list[i];
                }
            } else if (
                text(
                    list[i].title
                ) ===
                text(title)
            ) {
                return list[i];
            }
        }

        return null;
    }

    function saveItem(item) {
        var list = read();
        var key =
            movieKey(item);

        var saved = false;

        for (
            var i = 0;
            i < list.length;
            i++
        ) {
            if (
                movieKey(
                    list[i]
                ) === key
            ) {
                list[i] = item;
                saved = true;
                break;
            }
        }

        if (!saved) {
            list.push(item);
        }

        write(list);
    }

    function activeMovie() {
        if (
            !Lampa.Activity ||
            typeof Lampa.Activity.active !==
                'function'
        ) {
            return null;
        }

        var active =
            Lampa.Activity.active() ||
            {};

        return (
            active.movie ||
            (
                active.object &&
                active.object.movie
            ) ||
            active.card ||
            active.item ||
            null
        );
    }

    function savedMovie(item) {
        if (item.movie_object) {
            return clone(
                item.movie_object
            );
        }

        return {
            id:
                item.movie_id,

            title:
                item.title,

            name:
                item.title,

            original_title:
                item.original_title,

            original_name:
                item.original_title,

            poster_path:
                item.poster,

            backdrop_path:
                item.backdrop,

            media_type:
                'tv',

            source:
                'tmdb'
        };
    }

    function captureTorrentStart() {
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

        var original =
            Lampa.Torrent.start;

        function wrapped(
            torrent,
            movie
        ) {
            pendingTorrent =
                torrent
                    ? clone(torrent)
                    : null;

            pendingMovie =
                clone(
                    movie ||
                    activeMovie() ||
                    {}
                );

            if (
                pendingSeason &&
                Date.now() >
                    pendingSeason.expires_at
            ) {
                pendingSeason = null;
            }

            return original.apply(
                Lampa.Torrent,
                arguments
            );
        }

        wrapped.seriesNotifyWrapped =
            true;

        wrapped.seriesNotifyOriginal =
            original;

        Lampa.Torrent.start =
            wrapped;

        return true;
    }

    function saveSubscription(event) {
        var file =
            event.element || {};

        var params =
            event.params || {};

        var movie =
            pendingMovie
                ? clone(
                    pendingMovie
                )
                : clone(
                    params.movie ||
                    {}
                );

        var torrent =
            pendingTorrent
                ? clone(
                    pendingTorrent
                )
                : null;

        var files =
            normalizeFiles(
                event.items ||
                params.files ||
                []
            );

        pendingMovie = null;
        pendingTorrent = null;

        if (
            !isSeries(
                torrent,
                file,
                files
            )
        ) {
            return;
        }

        var target =
            pendingSeason;

        if (
            target &&
            Date.now() >
                target.expires_at
        ) {
            target = null;
            pendingSeason = null;
        }

        var range =
            seasonRange(
                torrentTitle(torrent) ||
                file.path ||
                file.title ||
                file.name,
                file,
                files
            );

        if (
            target &&
            target.season &&
            (
                !range ||
                range.seasons.indexOf(
                    Number(
                        target.season
                    )
                ) < 0
            )
        ) {
            range = {
                start:
                    Number(
                        target.season
                    ),

                end:
                    Number(
                        target.season
                    ),

                seasons: [
                    Number(
                        target.season
                    )
                ]
            };
        }

        var existing = null;

        if (target) {
            var stored =
                read();

            for (
                var i = 0;
                i < stored.length;
                i++
            ) {
                if (
                    movieKey(
                        stored[i]
                    ) ===
                    target.movie_key
                ) {
                    existing =
                        stored[i];

                    break;
                }
            }
        }

        if (!existing) {
            existing =
                findByMovie(
                    movie.id,
                    movie.name ||
                    movie.title
                );
        }

        var item =
            existing || {
                id:
                    '',

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
                    movie,

                new_files:
                    [],

                season_torrents:
                    [],

                missing_seasons:
                    [],

                unseen_update:
                    false,

                catalog_initialized:
                    false,

                created_at:
                    Date.now()
            };

        if (
            movie &&
            Object.keys(movie).length
        ) {
            item.movie_object =
                movie;
        }

        item.current_files =
            files;

        item.current_file_count =
            files.length;

        item.season =
            typeof file.season !==
            'undefined'
                ? file.season
                : null;

        item.episode =
            typeof file.episode !==
            'undefined'
                ? file.episode
                : null;

        item.torrent_hash =
            file.torrent_hash ||
            file.hash ||
            item.torrent_hash ||
            '';

        if (
            range &&
            torrent
        ) {
            setManualReference(
                item,
                {
                    range:
                        range,

                    label:
                        seasonLabel(range),

                    torrent_object:
                        clone(torrent),

                    profile:
                        profile(torrent),

                    added_at:
                        Date.now(),

                    manual:
                        true,

                    is_new:
                        false
                }
            );
        }

        item.season_ceiling =
            Math.max(
                Number(
                    item.season_ceiling ||
                    0
                ),

                movieSeasonCount(
                    item.movie_object
                ),

                maximumKnownSeason(item)
            );

        item.id =
            subscriptionId(item);

        rebuildMissingSeasons(
            item,
            item.season_ceiling
        );

        updateState(item);
        saveItem(item);
        migrate();
        updateIndicators();

        pendingSeason = null;

        setTimeout(
            runCheck,
            300
        );
    }

    function launchTorrent(
        item,
        entry
    ) {
        if (
            !entry ||
            !entry.torrent_object ||
            !Lampa.Torrent ||
            typeof Lampa.Torrent.start !==
                'function'
        ) {
            return;
        }

        entry.is_new =
            false;

        item.updated_at =
            Date.now();

        updateState(item);
        saveItem(item);
        updateIndicators();

        var movie =
            savedMovie(item);

        pendingMovie =
            clone(movie);

        pendingTorrent =
            clone(
                entry.torrent_object
            );

        Lampa.Torrent.start(
            clone(
                entry.torrent_object
            ),
            movie
        );
    }

    function returnToContent() {
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
        } catch (error) {}
    }

    function openSeasonSearch(
        item,
        season
    ) {
        pendingSeason = {
            movie_key:
                movieKey(item),

            season:
                Number(season),

            expires_at:
                Date.now() +
                10 * 60 * 1000
        };

        Lampa.Activity.push({
            url:
                '',

            title:
                'S' +
                Number(season) +
                ' — выбор раздачи',

            component:
                'torrents',

            search:
                (
                    item.title ||
                    item.original_title ||
                    ''
                ) +
                ' S' +
                Number(season),

            movie:
                savedMovie(item),

            page:
                1
        });
    }

    function showSeasonMenu(item) {
        ensureSeasonData(item);

        var maximum =
            maximumKnownSeason(item);

        var options = [];

        for (
            var season = 1;
            season <= maximum;
            season++
        ) {
            var entry =
                bestEntryForSeason(
                    item,
                    season
                );

            if (entry) {
                options.push({
                    title:
                        'S' +
                        season,

                    value:
                        'season_' +
                        season,

                    season:
                        season,

                    entry:
                        entry
                });
            } else {
                options.push({
                    title:
                        'S' +
                        season +
                        ' — подобрать раздачу',

                    value:
                        'search_' +
                        season,

                    season:
                        season,

                    missing:
                        true
                });
            }
        }

        Lampa.Select.show({
            title:
                item.title ||
                'Сезоны',

            items:
                options,

            onSelect:
                function (selected) {
                    returnToContent();

                    if (
                        selected &&
                        selected.entry
                    ) {
                        launchTorrent(
                            item,
                            selected.entry
                        );

                        return;
                    }

                    if (
                        selected &&
                        selected.season
                    ) {
                        openSeasonSearch(
                            item,
                            selected.season
                        );
                    }
                },

            onBack:
                returnToContent
        });
    }

    function openCard(card) {
        var item =
            findById(
                card.series_notify_id
            ) ||
            findByMovie(
                card.id,
                card.title ||
                card.name
            );

        if (!item) {
            return;
        }

        markItemViewed(item);

        var maximum =
            maximumKnownSeason(item);

        if (maximum > 1) {
            showSeasonMenu(item);
            return;
        }

        var entry =
            bestEntryForSeason(
                item,
                maximum || 1
            );

        if (entry) {
            launchTorrent(
                item,
                entry
            );

            return;
        }

        if (item.torrent_object) {
            launchTorrent(
                item,
                {
                    torrent_object:
                        item.torrent_object,

                    is_new:
                        false
                }
            );
        }
    }

    function parserGet(
        item,
        query,
        callback
    ) {
        if (
            !Lampa.Parser ||
            typeof Lampa.Parser.get !==
                'function'
        ) {
            callback([]);
            return;
        }

        Lampa.Parser.get(
            {
                search:
                    query,

                movie:
                    savedMovie(item),

                other:
                    true,

                from_search:
                    true,

                global:
                    true
            },

            function (json) {
                callback(
                    json &&
                    Array.isArray(
                        json.Results
                    )
                        ? json.Results
                        : []
                );
            },

            function () {
                callback([]);
            }
        );
    }

    function seasonQueries(
        item,
        season
    ) {
        var original =
            item.original_title ||
            '';

        var localized =
            item.title ||
            '';

        var queries = [];

        function add(value) {
            value =
                String(value || '')
                    .replace(
                        /\s+/g,
                        ' '
                    )
                    .trim();

            if (
                value &&
                queries.indexOf(
                    value
                ) < 0
            ) {
                queries.push(value);
            }
        }

        add(
            original +
            ' S' +
            season
        );

        add(
            original +
            ' Season ' +
            season
        );

        add(
            localized +
            ' S' +
            season
        );

        add(
            localized +
            ' ' +
            season +
            ' сезон'
        );

        return queries;
    }

    function torrentIdentity(torrent) {
        return (
            torrentLink(torrent) ||
            [
                torrentTitle(torrent),
                torrentTracker(torrent)
            ].join('|')
        );
    }

    function mergeResults(
        target,
        results
    ) {
        var used = {};

        for (
            var i = 0;
            i < target.length;
            i++
        ) {
            used[
                torrentIdentity(
                    target[i]
                )
            ] = true;
        }

        for (
            var j = 0;
            j < results.length;
            j++
        ) {
            var key =
                torrentIdentity(
                    results[j]
                );

            if (
                !key ||
                used[key]
            ) {
                continue;
            }

            used[key] = true;

            target.push(
                results[j]
            );
        }

        return target;
    }

    function searchSeason(
        item,
        season,
        callback
    ) {
        var queries =
            seasonQueries(
                item,
                season
            );

        var index = 0;
        var combined = [];

        function nextQuery() {
            if (
                index >= queries.length
            ) {
                callback(combined);
                return;
            }

            parserGet(
                item,
                queries[index],
                function (results) {
                    mergeResults(
                        combined,
                        results
                    );

                    index++;

                    setTimeout(
                        nextQuery,
                        350
                    );
                }
            );
        }

        nextQuery();
    }

    function softProfileScore(
        candidate,
        reference
    ) {
        candidate =
            candidate || {};

        reference =
            reference || {};

        var score = 0;

        if (
            candidate.resolution &&
            reference.resolution
        ) {
            if (
                candidate.resolution !==
                reference.resolution
            ) {
                return -1000;
            }

            score += 50;
        }

        if (
            candidate.uploader &&
            reference.uploader
        ) {
            if (
                candidate.uploader ===
                reference.uploader
            ) {
                score += 80;
            } else {
                score -= 15;
            }
        }

        if (
            candidate.group &&
            reference.group
        ) {
            if (
                candidate.group ===
                reference.group
            ) {
                score += 60;
            } else {
                score -= 10;
            }
        }

        if (
            candidate.tracker &&
            reference.tracker &&
            candidate.tracker ===
                reference.tracker
        ) {
            score += 10;
        }

        if (
            candidate.base &&
            reference.base
        ) {
            if (
                candidate.base ===
                reference.base
            ) {
                score += 40;
            } else if (
                candidate.base.indexOf(
                    reference.base
                ) >= 0 ||
                reference.base.indexOf(
                    candidate.base
                ) >= 0
            ) {
                score += 20;
            }
        }

        return score;
    }

    function candidateRank(
        torrent,
        range,
        season,
        reference
    ) {
        var candidateProfile =
            profile(torrent);

        var exact =
            Number(
                range.start
            ) ===
                Number(season) &&
            Number(
                range.end
            ) ===
                Number(season);

        return {
            torrent:
                torrent,

            range:
                range,

            profile:
                candidateProfile,

            score:
                softProfileScore(
                    candidateProfile,
                    reference
                ),

            exact:
                exact
                    ? 1
                    : 0,

            span:
                Number(
                    range.end
                ) -
                Number(
                    range.start
                ),

            seeds:
                Number(
                    torrent.Seeders ||
                    torrent.seeders ||
                    torrent.Seeds ||
                    torrent.seeds ||
                    0
                )
        };
    }

    function chooseSeasonCandidate(
        results,
        season,
        reference
    ) {
        var candidates = [];

        for (
            var i = 0;
            i < results.length;
            i++
        ) {
            var range =
                seasonRange(
                    torrentTitle(
                        results[i]
                    )
                );

            if (
                !range ||
                range.seasons.indexOf(
                    Number(season)
                ) < 0
            ) {
                continue;
            }

            var ranked =
                candidateRank(
                    results[i],
                    range,
                    season,
                    reference
                );

            if (
                ranked.score <= -1000
            ) {
                continue;
            }

            candidates.push(
                ranked
            );
        }

        candidates.sort(
            function (first, second) {
                if (
                    first.score !==
                    second.score
                ) {
                    return (
                        second.score -
                        first.score
                    );
                }

                if (
                    first.exact !==
                    second.exact
                ) {
                    return (
                        second.exact -
                        first.exact
                    );
                }

                if (
                    first.span !==
                    second.span
                ) {
                    return (
                        first.span -
                        second.span
                    );
                }

                return (
                    second.seeds -
                    first.seeds
                );
            }
        );

        return candidates.length
            ? candidates[0]
            : null;
    }
        function checkItem(
        item,
        callback
    ) {
        ensureSeasonData(item);

        var reference =
            getReferenceProfile(item);

        if (!reference) {
            callback(false);
            return;
        }

        var previousCeiling =
            Math.max(
                Number(
                    item.season_ceiling ||
                    0
                ),

                maximumKnownSeason(item),

                movieSeasonCount(
                    item.movie_object
                )
            );

        if (!previousCeiling) {
            callback(false);
            return;
        }

        var initializing =
            !item.catalog_initialized;

        var seasons = [];

        for (
            var season = 1;
            season <= previousCeiling;
            season++
        ) {
            seasons.push(season);
        }

        var index = 0;
        var changed = false;
        var newReleaseFound = false;

        function nextSeason() {
            if (
                index >= seasons.length
            ) {
                item.catalog_initialized =
                    true;

                item.last_checked_at =
                    Date.now();

                rebuildMissingSeasons(
                    item,
                    item.season_ceiling
                );

                if (newReleaseFound) {
                    item.unseen_update =
                        true;

                    item.last_update_at =
                        Date.now();
                }

                updateState(item);
                callback(changed);
                return;
            }

            var currentSeason =
                seasons[index];

            index++;

            searchSeason(
                item,
                currentSeason,
                function (results) {
                    var selected =
                        chooseSeasonCandidate(
                            results,
                            currentSeason,
                            reference
                        );

                    if (!selected) {
                        setTimeout(
                            nextSeason,
                            SEARCH_STEP_DELAY
                        );

                        return;
                    }

                    var currentEntry =
                        bestEntryForSeason(
                            item,
                            currentSeason
                        );

                    var currentScore =
                        currentEntry
                            ? softProfileScore(
                                currentEntry.profile ||
                                profile(
                                    currentEntry
                                        .torrent_object
                                ),
                                reference
                            )
                            : -1000;

                    var selectedIsBetter =
                        !currentEntry ||
                        selected.score >
                            currentScore ||
                        (
                            selected.score ===
                                currentScore &&
                            selected.exact &&
                            entrySpan(
                                currentEntry
                            ) > 0
                        ) ||
                        (
                            selected.score ===
                                currentScore &&
                            selected.span <
                                entrySpan(
                                    currentEntry
                                )
                        );

                    if (
                        currentEntry &&
                        torrentIdentity(
                            currentEntry
                                .torrent_object
                        ) ===
                        torrentIdentity(
                            selected.torrent
                        )
                    ) {
                        selectedIsBetter =
                            false;
                    }

                    if (selectedIsBetter) {
                        var isFutureRelease =
                            !initializing &&
                            currentSeason >
                                previousCeiling;

                        saveSeasonEntry(
                            item,
                            {
                                range:
                                    selected.range,

                                label:
                                    seasonLabel(
                                        selected.range
                                    ),

                                torrent_object:
                                    clone(
                                        selected.torrent
                                    ),

                                profile:
                                    selected.profile,

                                added_at:
                                    Date.now(),

                                manual:
                                    false,

                                is_new:
                                    isFutureRelease
                            }
                        );

                        changed = true;

                        if (isFutureRelease) {
                            newReleaseFound =
                                true;
                        }
                    }

                    setTimeout(
                        nextSeason,
                        SEARCH_STEP_DELAY
                    );
                }
            );
        }

        nextSeason();
    }

    function discoverFutureSeasons(
        item,
        callback
    ) {
        var query =
            item.original_title ||
            item.title ||
            '';

        if (!query) {
            callback(false);
            return;
        }

        var previousCeiling =
            Math.max(
                Number(
                    item.season_ceiling ||
                    0
                ),

                maximumKnownSeason(item),

                movieSeasonCount(
                    item.movie_object
                )
            );

        parserGet(
            item,
            query,
            function (results) {
                var maximum =
                    previousCeiling;

                for (
                    var i = 0;
                    i < results.length;
                    i++
                ) {
                    var range =
                        seasonRange(
                            torrentTitle(
                                results[i]
                            )
                        );

                    if (
                        range &&
                        Number(
                            range.end
                        ) > maximum
                    ) {
                        maximum =
                            Number(
                                range.end
                            );
                    }
                }

                if (
                    maximum <=
                    previousCeiling
                ) {
                    callback(false);
                    return;
                }

                item.season_ceiling =
                    maximum;

                rebuildMissingSeasons(
                    item,
                    maximum
                );

                item.catalog_initialized =
                    false;

                item.updated_at =
                    Date.now();

                callback(true);
            }
        );
    }

    function checkSubscription(
        item,
        callback
    ) {
        discoverFutureSeasons(
            item,
            function (ceilingChanged) {
                checkItem(
                    item,
                    function (itemChanged) {
                        callback(
                            ceilingChanged ||
                            itemChanged
                        );
                    }
                );
            }
        );
    }

    function runCheck() {
        if (checking) {
            return;
        }

        var list = read();

        if (!list.length) {
            return;
        }

        checking = true;

        var index = 0;
        var changed = false;

        function next() {
            if (
                index >= list.length
            ) {
                checking = false;

                if (changed) {
                    write(list);
                    updateIndicators();
                }

                return;
            }

            checkSubscription(
                list[index],
                function (result) {
                    changed =
                        changed ||
                        result;

                    index++;

                    setTimeout(
                        next,
                        SEARCH_STEP_DELAY
                    );
                }
            );
        }

        next();
    }

    function notificationCount() {
        var list = read();
        var count = 0;

        for (
            var i = 0;
            i < list.length;
            i++
        ) {
            if (
                updateState(
                    list[i]
                ).has_update
            ) {
                count++;
            }
        }

        return count;
    }

    function mortySvg() {
        return (
            '<svg ' +
            'viewBox="0 0 64 64" ' +
            'xmlns="http://www.w3.org/2000/svg">' +

            '<circle ' +
            'cx="32" ' +
            'cy="34" ' +
            'r="21" ' +
            'fill="#f2c29b" ' +
            'stroke="currentColor" ' +
            'stroke-width="3"/>' +

            '<path ' +
            'd="M14 27' +
            'C16 13 25 8 36 10' +
            'C46 11 51 18 50 28' +
            'C44 23 39 21 32 21' +
            'C25 21 19 23 14 27Z" ' +
            'fill="#754626" ' +
            'stroke="currentColor" ' +
            'stroke-width="2.4" ' +
            'stroke-linejoin="round"/>' +

            '<ellipse ' +
            'cx="24" ' +
            'cy="34" ' +
            'rx="4.3" ' +
            'ry="5.4" ' +
            'fill="#fff" ' +
            'stroke="currentColor" ' +
            'stroke-width="2"/>' +

            '<ellipse ' +
            'cx="40" ' +
            'cy="34" ' +
            'rx="4.3" ' +
            'ry="5.4" ' +
            'fill="#fff" ' +
            'stroke="currentColor" ' +
            'stroke-width="2"/>' +

            '<circle ' +
            'cx="25" ' +
            'cy="35" ' +
            'r="1.5" ' +
            'fill="currentColor"/>' +

            '<circle ' +
            'cx="39" ' +
            'cy="35" ' +
            'r="1.5" ' +
            'fill="currentColor"/>' +

            '<path ' +
            'd="M23 49' +
            'C27 44 37 44 41 49" ' +
            'fill="none" ' +
            'stroke="currentColor" ' +
            'stroke-width="2.7" ' +
            'stroke-linecap="round"/>' +

            '</svg>'
        );
    }

    function rickSvg() {
        return (
            '<svg ' +
            'viewBox="0 0 64 64" ' +
            'xmlns="http://www.w3.org/2000/svg">' +

            '<path ' +
            'd="M12 23' +
            'L5 17' +
            'L15 16' +
            'L10 6' +
            'L22 13' +
            'L24 2' +
            'L31 12' +
            'L38 2' +
            'L40 13' +
            'L53 6' +
            'L48 17' +
            'L59 18' +
            'L51 24Z" ' +
            'fill="#a8e6ef" ' +
            'stroke="currentColor" ' +
            'stroke-width="2.5" ' +
            'stroke-linejoin="round"/>' +

            '<path ' +
            'd="M15 25' +
            'C15 15 23 11 32 11' +
            'C43 11 50 18 49 31' +
            'C48 46 42 55 32 56' +
            'C21 55 15 46 15 31Z" ' +
            'fill="#d8c29d" ' +
            'stroke="currentColor" ' +
            'stroke-width="3"/>' +

            '<ellipse ' +
            'cx="24" ' +
            'cy="31" ' +
            'rx="5" ' +
            'ry="6" ' +
            'fill="#fff" ' +
            'stroke="currentColor" ' +
            'stroke-width="2"/>' +

            '<ellipse ' +
            'cx="40" ' +
            'cy="31" ' +
            'rx="5" ' +
            'ry="6" ' +
            'fill="#fff" ' +
            'stroke="currentColor" ' +
            'stroke-width="2"/>' +

            '<circle ' +
            'cx="25" ' +
            'cy="32" ' +
            'r="1.6" ' +
            'fill="currentColor"/>' +

            '<circle ' +
            'cx="39" ' +
            'cy="32" ' +
            'r="1.6" ' +
            'fill="currentColor"/>' +

            '<path ' +
            'd="M21 42' +
            'C26 49 38 49 43 41' +
            'C37 44 27 44 21 42Z" ' +
            'fill="#fff" ' +
            'stroke="currentColor" ' +
            'stroke-width="2.3" ' +
            'stroke-linejoin="round"/>' +

            '<path ' +
            'd="M17 27L28 24" ' +
            'stroke="currentColor" ' +
            'stroke-width="2.7" ' +
            'stroke-linecap="round"/>' +

            '<path ' +
            'd="M36 24L47 27" ' +
            'stroke="currentColor" ' +
            'stroke-width="2.7" ' +
            'stroke-linecap="round"/>' +

            '</svg>'
        );
    }

    function faceIcon(
        active,
        count
    ) {
        if (!active) {
            return (
                '<div class="series-notify-face">' +
                '<div class="series-notify-morty">' +
                mortySvg() +
                '</div>' +
                '</div>'
            );
        }

        return (
            '<div class="series-notify-face">' +

            '<div class="series-notify-rick">' +
            rickSvg() +
            '</div>' +

            '<div class="series-notify-counter">' +
            (
                count > 99
                    ? '99+'
                    : count
            ) +
            '</div>' +

            '</div>'
        );
    }

    function redrawIcons(count) {
        var active =
            count > 0;

        $('.' + HEAD_CLASS)
            .html(
                faceIcon(
                    active,
                    count
                )
            );

        $('.' + MENU_CLASS)
            .find(
                '.menu__ico'
            )
            .html(
                faceIcon(
                    active,
                    count
                )
            );
    }

    function updateIndicators() {
        var count =
            notificationCount();

        $(
            '.' +
            MENU_CLASS +
            ' .menu__text'
        ).text(
            'Обновления (' +
            count +
            ')'
        );

        redrawIcons(count);
    }

    function sortItems(list) {
        return list.sort(
            function (
                first,
                second
            ) {
                updateState(first);
                updateState(second);

                if (
                    !!first.has_update !==
                    !!second.has_update
                ) {
                    return second.has_update
                        ? 1
                        : -1;
                }

                var firstTime =
                    Number(
                        first.last_update_at ||
                        first.updated_at ||
                        first.created_at ||
                        0
                    );

                var secondTime =
                    Number(
                        second.last_update_at ||
                        second.updated_at ||
                        second.created_at ||
                        0
                    );

                if (
                    firstTime !==
                    secondTime
                ) {
                    return (
                        secondTime -
                        firstTime
                    );
                }

                return String(
                    first.title || ''
                ).localeCompare(
                    String(
                        second.title ||
                        ''
                    )
                );
            }
        );
    }

    function removeItem(card) {
        var list = read();
        var result = [];

        for (
            var i = 0;
            i < list.length;
            i++
        ) {
            var item =
                list[i];

            var sameId =
                card.series_notify_id &&
                item.id ===
                    card.series_notify_id;

            var sameMovie =
                card.id !== null &&
                typeof card.id !==
                    'undefined' &&
                item.movie_id !== null &&
                typeof item.movie_id !==
                    'undefined' &&
                String(
                    item.movie_id
                ) ===
                String(card.id);

            if (
                !sameId &&
                !sameMovie
            ) {
                result.push(item);
            }
        }

        if (
            result.length ===
            list.length
        ) {
            return false;
        }

        write(result);

        card.series_notify_deleted =
            true;

        updateIndicators();

        return true;
    }

    function confirmRemove(
        card,
        cardObject
    ) {
        if (
            card.series_notify_deleted
        ) {
            return;
        }

        var deleting = false;

        function remove() {
            if (deleting) {
                return;
            }

            deleting = true;
            returnToContent();

            setTimeout(
                function () {
                    if (
                        removeItem(card) &&
                        cardObject &&
                        typeof cardObject.render ===
                            'function'
                    ) {
                        var rendered =
                            cardObject.render();

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

        Lampa.Select.show({
            title:
                'Удалить «' +
                (
                    card.title ||
                    card.name ||
                    'этот сериал'
                ) +
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
                        remove();
                    } else {
                        returnToContent();
                    }
                },

            onBack:
                returnToContent
        });
    }

    function buildCards() {
        var list =
            sortItems(
                migrate()
            );

        var cards = [];

        for (
            var i = 0;
            i < list.length;
            i++
        ) {
            var item =
                updateState(
                    list[i]
                );

            cards.push({
                id:
                    item.movie_id,

                title:
                    item.title,

                name:
                    item.title,

                original_title:
                    item.original_title,

                original_name:
                    item.original_title,

                poster_path:
                    item.poster,

                backdrop_path:
                    item.backdrop,

                media_type:
                    'tv',

                source:
                    'tmdb',

                series_notify:
                    true,

                series_notify_id:
                    item.id,

                series_notify_has_update:
                    item.has_update
            });
        }

        return cards;
    }

    function component(object) {
        var instance =
            new Lampa.InteractionCategory(
                object
            );

        instance.create =
            function () {
                var cards =
                    buildCards();

                if (cards.length) {
                    this.build({
                        secuses:
                            true,

                        page:
                            1,

                        total_pages:
                            1,

                        results:
                            cards
                    });
                } else {
                    this.empty({
                        status:
                            404,

                        message:
                            'Подписок пока нет'
                    });
                }
            };

        instance.nextPageReuest =
            function (
                request,
                resolve
            ) {
                resolve({
                    secuses:
                        true,

                    page:
                        1,

                    total_pages:
                        1,

                    results:
                        []
                });
            };

        instance.cardRender =
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
                        rendered.length
                    ) {
                        rendered.toggleClass(
                            'series-notify-card-update',
                            !!element
                                .series_notify_has_update
                        );
                    }
                }

                card.onEnter =
                    function () {
                        openCard(element);

                        if (
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
                                rendered.removeClass(
                                    'series-notify-card-update'
                                );
                            }
                        }
                    };

                card.onMenu =
                    function () {
                        confirmRemove(
                            element,
                            card
                        );
                    };
            };

        return instance;
    }

    function styles() {
        if (
            $('#' + STYLE_ID).length
        ) {
            return;
        }

        $('head').append(
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
            'overflow:visible' +
            '}' +

            '.' +
            MENU_CLASS +
            ' .menu__ico{' +
            'position:relative;' +
            'overflow:visible' +
            '}' +

            '.series-notify-face{' +
            'position:relative;' +
            'display:block;' +
            'width:1.9em;' +
            'height:1.9em;' +
            'overflow:visible' +
            '}' +

            '.series-notify-face svg{' +
            'display:block;' +
            'width:100%;' +
            'height:100%;' +
            'overflow:visible' +
            '}' +

            '.series-notify-rick{' +
            'display:block;' +
            'width:100%;' +
            'height:100%;' +
            'filter:' +
            'drop-shadow(0 0 .18em rgba(111,255,225,.95)) ' +
            'drop-shadow(0 0 .42em rgba(80,220,255,.85)) ' +
            'drop-shadow(0 0 .75em rgba(94,255,153,.55))' +
            '}' +

            '.series-notify-morty{' +
            'display:block;' +
            'width:100%;' +
            'height:100%' +
            '}' +

            '.series-notify-counter{' +
            'position:absolute;' +
            'left:calc(100% - .15em);' +
            'top:calc(100% - .55em);' +
            'min-width:1.45em;' +
            'height:1.45em;' +
            'padding:0 .28em;' +
            'border-radius:1em;' +
            'background:#e53935;' +
            'color:#fff;' +
            'border:.12em solid rgba(255,255,255,.9);' +
            'font-size:.55em;' +
            'font-weight:700;' +
            'line-height:1.2em;' +
            'text-align:center;' +
            'box-sizing:border-box;' +
            'pointer-events:none;' +
            'z-index:20;' +
            'box-shadow:0 0 .4em rgba(0,0,0,.75)' +
            '}' +

            '.series-notify-card-update{' +
            'position:relative;' +
            'box-shadow:' +
            '0 0 0 .22em #ffb300,' +
            '0 0 1.2em rgba(255,179,0,.85);' +
            'border-radius:.35em' +
            '}' +

            '.series-notify-card-update:after{' +
            'content:"NEW";' +
            'position:absolute;' +
            'right:.45em;' +
            'top:.45em;' +
            'padding:.22em .45em;' +
            'border-radius:.35em;' +
            'background:#ffb300;' +
            'color:#111;' +
            'font-size:.6em;' +
            'font-weight:700;' +
            'line-height:1;' +
            'z-index:5' +
            '}' +

            '.series-notify-card-deleted{' +
            'opacity:.35;' +
            'filter:grayscale(1)' +
            '}' +

            '</style>'
        );
    }

    function openUpdates() {
        Lampa.Activity.push({
            url:
                '',

            title:
                'Series Notify',

            component:
                COMPONENT_NAME,

            page:
                1
        });
    }

    function ensureHeadButton() {
        var actions =
            $('.head__actions');

        if (!actions.length) {
            return false;
        }

        if (
            !$('.' + HEAD_CLASS).length
        ) {
            var button = $(
                '<div class="head__action selector ' +
                HEAD_CLASS +
                '"></div>'
            );

            button.on(
                'hover:enter',
                openUpdates
            );

            actions.prepend(button);
        }

        updateIndicators();

        return true;
    }

    function addMenu() {
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

            '<div class="menu__ico"></div>' +

            '<div class="menu__text">' +
            'Обновления (0)' +
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

    function watchHead() {
        if (headTimer) {
            clearInterval(
                headTimer
            );
        }

        headTimer =
            setInterval(
                ensureHeadButton,
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
                            ensureHeadButton();
                        }
                    }
                );

            headObserver.observe(
                document.body,
                {
                    childList:
                        true,

                    subtree:
                        true
                }
            );
        }

        ensureHeadButton();
    }

    function start() {
        if (
            window.seriesNotifyStarted
        ) {
            return;
        }

        window.seriesNotifyStarted =
            true;

        Lampa.Manifest.plugins =
            manifest;

        migrate();
        styles();

        Lampa.Component.add(
            COMPONENT_NAME,
            component
        );

        captureTorrentStart();

        var attempts = 0;

        var captureTimer =
            setInterval(
                function () {
                    attempts++;

                    if (
                        captureTorrentStart() ||
                        attempts >= 30
                    ) {
                        clearInterval(
                            captureTimer
                        );
                    }
                },
                500
            );

        addMenu();
        watchHead();

        Lampa.Listener.follow(
            'torrent_file',
            function (event) {
                if (
                    event &&
                    event.type ===
                        'onenter'
                ) {
                    saveSubscription(
                        event
                    );
                }
            }
        );

        Lampa.Listener.follow(
            'app',
            function () {
                captureTorrentStart();

                setTimeout(
                    ensureHeadButton,
                    300
                );
            }
        );

        setTimeout(
            runCheck,
            FIRST_CHECK_DELAY
        );

        if (checkTimer) {
            clearInterval(
                checkTimer
            );
        }

        checkTimer =
            setInterval(
                runCheck,
                CHECK_INTERVAL
            );

        updateIndicators();

        log(
            'Версия 1.1.4 запущена'
        );
    }

    if (window.appready) {
        start();
    } else {
        Lampa.Listener.follow(
            'app',
            function (event) {
                if (
                    event.type ===
                        'ready'
                ) {
                    start();
                }
            }
        );
    }
})();