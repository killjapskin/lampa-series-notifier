(function () {
    'use strict';

    const SeriesNotify = {
        version: '0.0.1',

        init() {
            console.log('[Series Notify] Plugin loaded');
        }
    };

    if (window.appready) {
        SeriesNotify.init();
    } else {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') {
                SeriesNotify.init();
            }
        });
    }
})();