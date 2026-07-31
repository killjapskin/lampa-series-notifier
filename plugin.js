(function () {
    'use strict';

    window.seriesNotifyPluginLoaded = true;

    if (window.Lampa && Lampa.Manifest) {
        Lampa.Manifest.plugins = {
            type: 'other',
            version: '0.1.0',
            name: 'Series Notify',
            description: 'Уведомления о новых сериях'
        };
    }
})();