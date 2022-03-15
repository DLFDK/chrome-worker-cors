workerFunction();
function workerFunction() {
    onmessage = async ({ data: { topic, ...rest } }) => {
        switch (topic) {
            case "fetch":
                const { id, url, tileX, tileY } = rest;
                const response = await fetch(url).catch(error => {
                    console.log(error);
                });
                if (response?.ok) {
                    const blob = await response.blob();
                    const bitmap = await createImageBitmap(blob);
                    postMessage({ id, bitmap, tileX, tileY }, [bitmap]);
                }
                break;
        }
    }
}