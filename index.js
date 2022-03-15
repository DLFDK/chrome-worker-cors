
fetch("https://tile.openstreetmap.org/0/0/0.png").catch(error => {
    console.log("Index.js failed to fetch");
});

const worker = new Worker("worker.js");