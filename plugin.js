(function () {
    'use strict';

    const SeriesNotify = {
        version: '0.0.1',

        init: function () {
            console.log('[Series Notify] Loaded');

            if (window.Lampa && Lampa.Noty) {
                Lampa.Noty.show('Series Notify загружен');
            }
        }
    };

    function start() {
        SeriesNotify.init();
    }

    if (window.appready) {
        start();
    } else {
        Lampa.Listener.follow('app', function (e) {
            if (e.type === 'ready') {
                start();
            }
        });
    }
})();