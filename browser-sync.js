const browserSync = require('browser-sync').create();
browserSync.init({
    server: {
        baseDir: './',
        port: 3000,
    },
    startPath: '/',
    ghostMode: false,
    open: false
});