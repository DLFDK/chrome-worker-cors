
fetch("https://tile.openstreetmap.org/0/0/0.png").catch(error => {
    console.log("Index.js failed to fetch");
});

const externalWorker = new Worker("worker.js");

const inlineWorker = new Worker(URL.createObjectURL(new Blob([`(${workerFunction.toString()})()`], { type: 'text/javascript' })));

function workerFunction() {
    fetch("https://tile.openstreetmap.org/0/0/0.png").catch(error => {
        console.log("Inline Worker failed to fetch");
    });
}