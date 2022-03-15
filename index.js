fetch("https://tile.openstreetmap.org/0/0/0.png");

new Worker("worker.js");

new Worker(URL.createObjectURL(new Blob([`(${workerFunction.toString()})()`], { type: 'text/javascript' })));

function workerFunction() {
    fetch("https://tile.openstreetmap.org/0/0/0.png");
}