(function () {
    'use strict';

    Lampa.Utils.putScriptAsync([
        'https://killjapskin.github.io/lampa-series-notifier/SeriesNotify/SeriesNotify.js?v=2'
    ], function () {
        if (window.Lampa && Lampa.Noty) {
            Lampa.Noty.show('Series Notify: основной файл загружен');
        }
    });
})();