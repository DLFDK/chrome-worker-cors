fetch("https://tile.openstreetmap.org/0/0/0.png").catch(error => {
    console.log("External Worker failed to fetch");
});