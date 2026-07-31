(function () {
    'use strict';

    var STORAGE_KEY = 'series_notify_subscriptions';

    function getSubscriptions() {
        var subscriptions = Lampa.Storage.get(STORAGE_KEY, []);

        return Array.isArray(subscriptions) ? subscriptions : [];
    }

    function saveSubscriptions(subscriptions) {
        Lampa.Storage.set(STORAGE_KEY, subscriptions);
    }

    function getSubscriptionId(data) {
        return [
            data.movie_id || data.title,
            data.torrent_hash || data.torrent_title
        ].join('_');
    }

    function saveSubscription(event) {
        var file = event.element || {};
        var params = event.params || {};
        var movie = params.movie || {};

        var subscription = {
            id: '',
            movie_id: movie.id || null,
            title: movie.name || movie.title || file.first_title || '',
            original_title: movie.original_name || movie.original_title || '',
            poster: movie.poster_path || movie.poster || '',
            torrent_hash: file.torrent_hash || file.hash || '',
            torrent_title: file.path || file.title || file.name || '',
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
                subscriptions[existingIndex].created_at || Date.now();

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

        console.log(
            '[Series Notify] Subscriptions:',
            subscriptions
        );
    }

    function startPlugin() {
        if (window.seriesNotifyStarted) return;

        window.seriesNotifyStarted = true;

        Lampa.Listener.follow('torrent_file', function (event) {
            if (!event || event.type !== 'onenter') return;

            saveSubscription(event);
        });

        Lampa.Noty.show(
            'Series Notify запущен. Подписок: ' +
            getSubscriptions().length
        );
    }

    if (window.appready) {
        startPlugin();
    } else {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') {
                startPlugin();
            }
        });
    }
})();