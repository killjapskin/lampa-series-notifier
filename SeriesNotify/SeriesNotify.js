(function () {
    'use strict';

    function startPlugin() {
        if (window.seriesNotifyStarted) return;

        window.seriesNotifyStarted = true;

        console.log('[Series Notify] Started');

        if (window.Lampa && Lampa.Noty) {
            Lampa.Noty.show('Series Notify запущен');
        }
    }

    if (window.appready) {
        startPlugin();
    } else if (window.Lampa && Lampa.Listener) {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') {
                startPlugin();
            }
        });
    }
})();