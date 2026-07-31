(function () {
    'use strict';

    var STORAGE_KEY = 'series_notify_subscriptions';
    var COMPONENT_NAME = 'series_notify';
    var MENU_CLASS = 'series-notify-menu-item';

    var manifest = {
        type: 'video',
        version: '0.2.0',
        name: 'Обновления',
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

        return Array.isArray(subscriptions) ? subscriptions : [];
    }

    function saveSubscriptions(subscriptions) {
        Lampa.Storage.set(STORAGE_KEY, subscriptions);
    }

    function getSubscriptionId(data) {
        return [
            data.movie_id || data.title || 'unknown',
            data.torrent_hash || data.torrent_title || 'unknown'
        ].join('_');
    }

    function getMenuTitle() {
        var notifications = 0;

        return 'Обновления (' + notifications + ')';
    }

    function updateMenuTitle() {
        $('.' + MENU_CLASS + ' .menu__text').text(getMenuTitle());
    }

    function saveSubscription(event) {
        var file = event.element || {};
        var params = event.params || {};
        var movie = params.movie || {};

        var subscription = {
            id: '',
            movie_id: movie.id || null,
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
            season: file.season || null,
            episode: file.episode || null,
            updated_at: Date.now()
        };

        subscription.id = getSubscriptionId(subscription);

        var subscriptions = getSubscriptions();
        var existingIndex = -1;

        for (var i = 0; i < subscriptions.length; i++) {
            if (subscriptions[i].id === subscription.id) {
                existingIndex = i;
                break;
            }
        }

        if (existingIndex >= 0) {
            subscription.created_at =
                subscriptions[existingIndex].created_at ||
                Date.now();

            subscriptions[existingIndex] = subscription;

            Lampa.Noty.show(
                'Series Notify: подписка обновлена (' +
                subscriptions.length +
                ')'
            );
        } else {
            subscription.created_at = Date.now();
            subscriptions.push(subscription);

            Lampa.Noty.show(
                'Series Notify: подписка сохранена (' +
                subscriptions.length +
                ')'
            );
        }

        saveSubscriptions(subscriptions);
        updateMenuTitle();

        console.log(
            '[Series Notify] Subscriptions:',
            subscriptions
        );
    }

    function buildCards() {
        var subscriptions = getSubscriptions();
        var cards = [];

        for (var i = 0; i < subscriptions.length; i++) {
            var subscription = subscriptions[i];

            cards.push({
                id: subscription.movie_id,
                title: subscription.title,
                name: subscription.title,
                original_title: subscription.original_title,
                original_name: subscription.original_title,
                poster_path: subscription.poster,
                backdrop_path: subscription.backdrop,
                media_type: 'tv',
                source: 'tmdb',

                series_notify: true,
                series_notify_id: subscription.id,
                series_notify_torrent:
                    subscription.torrent_title,
                series_notify_season:
                    subscription.season,
                series_notify_episode:
                    subscription.episode
            });
        }

        return cards;
    }

    function createComponent(object) {
        var component =
            new Lampa.InteractionCategory(object);

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
                    message: 'Подписок пока нет'
                });
            }
        };

        component.nextPageReuest = function (
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

    function addMenuItem() {
        if ($('.' + MENU_CLASS).length) return;

        var button = $(
            '<li class="menu__item selector ' +
            MENU_CLASS +
            '">' +
                '<div class="menu__ico">' +
                    '<svg viewBox="0 0 24 24" ' +
                    'fill="currentColor" ' +
                    'xmlns="http://www.w3.org/2000/svg">' +
                        '<path d="M12 22a2.5 2.5 0 0 0 ' +
                        '2.45-2h-4.9A2.5 2.5 0 0 0 ' +
                        '12 22Zm7-6v-5a7 7 0 0 0-5-6.71' +
                        'V3a2 2 0 1 0-4 0v1.29A7 7 0 0 0 ' +
                        '5 11v5l-2 2v1h18v-1l-2-2Z"/>' +
                    '</svg>' +
                '</div>' +
                '<div class="menu__text">' +
                    getMenuTitle() +
                '</div>' +
            '</li>'
        );

        button.on('hover:enter', function () {
            Lampa.Activity.push({
                url: '',
                title: 'Series Notify',
                component: COMPONENT_NAME,
                page: 1
            });
        });

        $('.menu .menu__list').eq(0).append(button);
    }

    function startPlugin() {
        if (window.seriesNotifyStarted) return;

        window.seriesNotifyStarted = true;
        Lampa.Manifest.plugins = manifest;

        Lampa.Component.add(
            COMPONENT_NAME,
            createComponent
        );

        addMenuItem();

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
                if (event.type === 'ready') {
                    startPlugin();
                }
            }
        );
    }
})();