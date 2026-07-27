(function () {
    'use strict';

    function startPlugin() {
        if (window.seriesNotifyStarted) return;

        window.seriesNotifyStarted = true;

        console.log('[Series Notify] Started');

        Lampa.Listener.follow('torrent_file', function (event) {
            if (!event || event.type !== 'onenter') return;

            var file = event.element || {};
            var params = event.params || {};
            var movie = params.movie || {};

            var data = {
                movie_id: movie.id || null,
                title: movie.name || movie.title || file.first_title || '',
                poster: movie.poster_path || movie.poster || '',
                torrent_hash: file.torrent_hash || '',
                torrent_title: file.path || file.title || '',
                season: file.season || null,
                episode: file.episode || null,
                saved_at: Date.now()
            };

            Lampa.Storage.set('series_notify_last', data);

            console.log('[Series Notify] Torrent selected', data);

            if (Lampa.Noty) {
                Lampa.Noty.show('Series Notify: раздача сохранена');
            }
        });

        if (Lampa.Noty) {
            Lampa.Noty.show('Series Notify запущен');
        }
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