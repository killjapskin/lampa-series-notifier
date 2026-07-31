(function () {
    'use strict';

    var STORAGE_KEY = 'series_notify_subscriptions';
    var COMPONENT_NAME = 'series_notify';

    var MENU_CLASS = 'series-notify-menu-item';
    var HEAD_CLASS = 'series-notify-head-button';
    var STYLE_ID = 'series-notify-styles';

    var headObserver = null;
    var headTimer = null;

    var manifest = {
        type: 'video',
        version: '0.6.0',
        name: 'Series Notify',
        description: 'Уведомления о новых сериях',
        component: COMPONENT_NAME
    };

    function getSubscriptions() {
        var subscriptions = Lampa.Storage.get(STORAGE_KEY, []);

        if (typeof subscriptions === 'string') {
            try {
                subscriptions = JSON.parse(subscriptions);
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

    function getNotificationCount() {
        var subscriptions = getSubscriptions();
        var count = 0;

        for (
            var i = 0;
            i < subscriptions.length;
            i++
        ) {
            if (subscriptions[i].has_update) {
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

    function addStyles() {
        if ($('#' + STYLE_ID).length) {
            return;
        }

        var styles = $(
            '<style id="' + STYLE_ID + '">' +

                '.' + HEAD_CLASS + '{' +
                    'position:relative;' +
                    'display:flex;' +
                    'align-items:center;' +
                    'justify-content:center;' +
                '}' +

                '.' + HEAD_CLASS + ' svg{' +
                    'display:block;' +
                    'width:1.5em;' +
                    'height:1.5em;' +
                    'overflow:visible;' +
                '}' +

                '.' + HEAD_CLASS +
                ' .series-notify-active-background{' +
                    'display:none;' +
                '}' +

                '.' + HEAD_CLASS +
                '.series-notify-active ' +
                '.series-notify-active-background{' +
                    'display:block;' +
                '}' +

                '.' + HEAD_CLASS +
                '.series-notify-active ' +
                '.series-notify-star{' +
                    'fill:#fff;' +
                    'stroke:#fff;' +
                '}' +

                '.' + HEAD_CLASS +
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

                '.' + HEAD_CLASS +
                '.series-notify-active ' +
                '.series-notify-head-counter{' +
                    'display:block;' +
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

    function updateIndicators() {
        var count = getNotificationCount();

        $('.' + MENU_CLASS + ' .menu__text')
            .text(getMenuTitle());

        var headButton = $('.' + HEAD_CLASS);

        headButton.toggleClass(
            'series-notify-active',
            count > 0
        );

        headButton
            .find('.series-notify-head-counter')
            .text(count > 99 ? '99+' : count);
    }

    function saveSubscription(event) {
        var file = event.element || {};
        var params = event.params || {};
        var movie = params.movie || {};

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

            season:
                file.season ||
                null,

            episode:
                file.episode ||
                null,

            has_update: false,
            new_episode: null,

            updated_at: Date.now()
        };

        subscription.id =
            getSubscriptionId(subscription);

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
                subscriptions[existingIndex];

            subscription.created_at =
                existing.created_at ||
                Date.now();

            subscription.has_update =
                existing.has_update ||
                false;

            subscription.new_episode =
                existing.new_episode ||
                null;

            subscriptions[existingIndex] =
                subscription;

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
            '[Series Notify] Subscriptions:',
            subscriptions
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
                subscriptions[i];

            cards.push({
                id:
                    subscription.movie_id,

                title:
                    subscription.title,

                name:
                    subscription.title,

                original_title:
                    subscription.original_title,

                original_name:
                    subscription.original_title,

                poster_path:
                    subscription.poster,

                backdrop_path:
                    subscription.backdrop,

                media_type: 'tv',
                source: 'tmdb',

                series_notify: true,

                series_notify_id:
                    subscription.id,

                series_notify_torrent:
                    subscription.torrent_title,

                series_notify_season:
                    subscription.season,

                series_notify_episode:
                    subscription.episode,

                series_notify_has_update:
                    subscription.has_update,

                series_notify_new_episode:
                    subscription.new_episode
            });
        }

        return cards;
    }

    function createComponent(object) {
        var component =
            new Lampa.InteractionCategory(
                object
            );

        component.create = function () {
            var cards = buildCards();

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

        return component;
    }

    function createTopButton() {
        var button = $(
            '<div class="head__action selector ' +
                HEAD_CLASS +
            '" data-series-notify="true">' +

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
        var actions = $('.head__actions');

        if (!actions.length) {
            return false;
        }

        if (!$('.' + HEAD_CLASS).length) {
            var button = createTopButton();

            actions.prepend(button);

            console.log(
                '[Series Notify] Верхняя кнопка добавлена'
            );
        }

        updateIndicators();

        return true;
    }

    function watchTopPanel() {
        if (headTimer) {
            clearInterval(headTimer);
        }

        headTimer = setInterval(
            function () {
                ensureTopButton();
            },
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
                            !$('.' + HEAD_CLASS).length
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

    function addMenuItem() {
        if ($('.' + MENU_CLASS).length) {
            updateIndicators();
            return;
        }

        var button = $(
            '<li class="menu__item selector ' +
                MENU_CLASS +
            '">' +

                '<div class="menu__ico">' +

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

                    '</svg>' +

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
                    event.type !== 'onenter'
                ) {
                    return;
                }

                saveSubscription(event);
            }
        );

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
                    event.type === 'ready'
                ) {
                    startPlugin();
                }
            }
        );
    }
})();