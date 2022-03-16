new Worker("worker.js");

new Worker(URL.createObjectURL(new Blob([`(${workerFunction.toString()})()`], { type: 'text/javascript' })));

function workerFunction() {
    fetch("https://jsonplaceholder.typicode.com/posts/1");
}