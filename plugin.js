(function () {
    'use strict';

    function start() {
        Lampa.Noty.show('Series Notify: plugin.js работает');
    }

    if (window.appready) {
        start();
    } else {
        Lampa.Listener.follow('app', function (event) {
            if (event.type === 'ready') {
                start();
            }
        });
    }
})();