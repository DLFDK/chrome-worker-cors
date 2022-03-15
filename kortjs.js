export default class kortjs extends HTMLElement {
    constructor() {
        const kortjs = super();
        kortjs.style.display = "block";

        const config = (() => {
            const id = kortjs.dataset.id;
            const token = kortjs.dataset.token;
            const url = kortjs.dataset.url.replace("${id}", id).replace("${token}", token);
            const tilesize = kortjs.dataset.tilesize ? parseInt(kortjs.dataset.tilesize) : 256;

            const latitude = parseFloat(kortjs.dataset.setLatitude) || 51.479263;
            const longitude = parseFloat(kortjs.dataset.setLongitude) || 0;
            const zoomLevel = parseInt(kortjs.dataset.setZoom) || 10;

            function getURL({ zoom, tileX, tileY }) {
                return url.replace("${z}", zoom).replace("${x}", tileX).replace("${y}", tileY);
            }

            function getTileSize() {
                return tilesize;
            }

            function getCoordinatesAndZoom() {
                return [zoomLevel, longitude, latitude];
            }

            return { getURL, getTileSize, getCoordinatesAndZoom };
        })();


        const shadow = kortjs.attachShadow({ mode: "open" });
        const viewportElement = document.createElement("div");
        viewportElement.setAttribute("class", "viewport");

        const attribution = document.createElement("div");
        attribution.setAttribute("class", "attribution");
        const kortjsLink = document.createElement("a");
        kortjsLink.textContent = "kortjs |";
        kortjsLink.setAttribute("href", "https://www.openstreetmap.org/copyright");

        const slotAttribution = document.createElement("slot");
        slotAttribution.setAttribute("name", "attribution");
        attribution.append(kortjsLink, slotAttribution);

        const slotMarker = document.createElement("slot");
        slotMarker.setAttribute("name", "marker");

        const style = document.createElement("style");
        style.textContent = `.viewport{position:relative;width:100%;height:100%;overflow:hidden;touch-action:none;user-select:none;cursor:grab;background:var(--kortjs-backgroundColor, #aad3df)}.layer{position:absolute}.hidden{opacity:0}.middle{z-index:1}.top{z-index:2}canvas{position:absolute}.attribution{position:absolute;bottom:0;right:0;z-index:3;display:flex;gap:4px;padding:2px 6px 6px 6px;background:rgba(255,255,255,.5);border-top-left-radius:4px;font-size:11px;margin:0}::slotted(p){margin:0}slot[name=marker]{display:none}.default-marker{position:absolute;z-index:3;width:48px;height:48px;filter:drop-shadow(0 0.2rem 0.25rem rgba(0, 0, 0, 0.2))}`;
        shadow.append(viewportElement, style);
        viewportElement.append(attribution, slotMarker);

        const painter = (() => {
            const tilesBeingFetched = new Set();
            // const worker = new Worker(URL.createObjectURL(new Blob([`(${workerFunction.toString()})()`], { type: 'text/javascript' })));
            const worker = new Worker("kortjs-worker.js");
            worker.onmessage = workerMessage;

            function paint(layer, tileX, tileY, gridLengthX, gridLengthY) {
                const newTiles = [];
                const n = 2 ** layer.zoom;
                for (let i = 0; i < gridLengthY; i++) {
                    for (let j = 0; j < gridLengthX; j++) {
                        const id = `${layer.zoom},${tileX + j + layer.origin.tileX},${tileY + i + layer.origin.tileY}`;
                        const wrappedX = ((tileX + j + layer.origin.tileX) % n + n) % n;
                        const wrappedY = ((tileY + i + layer.origin.tileY) % n + n) % n;
                        const url = config.getURL({ zoom: layer.zoom, tileX: wrappedX, tileY: wrappedY });
                        newTiles.push(id);
                        if (layer.isActive && !layer.tiles.has(id) && !tilesBeingFetched.has(id)) {
                            tilesBeingFetched.add(id);
                            layer.tiles.set(id);
                            worker.postMessage({ topic: "fetch", id, url, tileX: tileX + j, tileY: tileY + i });

                        }
                    }
                }
                const deletedIDs = [...layer.tiles.keys()].filter(id => !newTiles.includes(id));
                for (const id of deletedIDs) {
                    if (layer.tiles.get(id)) {
                        const [canvas, ctx] = layer.tiles.get(id);
                        if (canvas) {
                            canvas.classList.add("hidden");
                            layer.tileStorage.push([canvas, ctx]);
                        }
                    }
                    layer.tiles.delete(id);
                }
            }

            function workerMessage({ data: { id, bitmap, tileX, tileY } }) {
                tilesBeingFetched.delete(id);
                map.addTile(id, bitmap, tileX, tileY);
            }

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

            return { paint };
        })();

        const map = (() => {
            const viewportOffset = 0;
            const { width: viewportWidth, height: viewportHeight } = viewportElement.getBoundingClientRect();
            const viewportHalfWidth = viewportWidth / 2;
            const viewportHalfHeight = viewportHeight / 2;
            const tileSize = config.getTileSize();
            const layers = [];
            let nextZoomLevel;

            initialize();
            addCenterMarker();
            refresh();

            function initialize() {
                addLayers();
                const [zoomLevel, longitude, latitude] = config.getCoordinatesAndZoom();
                nextZoomLevel = zoomLevel;
                layers[0].zoom = zoomLevel;
                layers[0].element.classList.add("top");

                const [centerTileX, centerTileY] = getCenterTile(longitude, latitude);
                setOrigin(layers[0], centerTileX, centerTileY);

                layers[0].isActive = true;

                function getCenterTile(longitude, latitude) {
                    const n = 2 ** layers[0].zoom;
                    const centerTileX = n * (longitude + 180) / 360;
                    const centerTileY = n * (1 - Math.log(Math.tan(latitude * Math.PI / 180) + 1 / Math.cos(latitude * Math.PI / 180)) / Math.PI) / 2;
                    return [centerTileX, centerTileY];
                }

                function addLayers() {
                    for (let i = 0; i < 3; i++) {
                        const layer = document.createElement("div");
                        layer.setAttribute("class", "layer");
                        viewportElement.appendChild(layer);
                        layers.push({
                            tiles: new Map(),
                            tileStorage: [],
                            scale: 1,
                            origin: {},
                            position: {
                                x: 0,
                                y: 0
                            },
                            element: layer,
                            isActive: false
                        });
                    }
                }
            }
            function setOrigin(layer, centerTileX, centerTileY) {
                const scaledTileSize = tileSize * layer.scale;

                const originTileX = centerTileX - viewportHalfWidth / scaledTileSize;
                layer.origin.tileX = Math.floor(originTileX);
                const originFractionX = originTileX - layer.origin.tileX;

                const originTileY = centerTileY - viewportHalfHeight / scaledTileSize;
                layer.origin.tileY = Math.floor(originTileY);
                const originFractionY = originTileY - layer.origin.tileY;

                layer.position.x = Math.round(-originFractionX * scaledTileSize);
                layer.position.y = Math.round(-originFractionY * scaledTileSize);
                setRelativePosition(layer, 0, 0, { round: false });
            }
            function setRelativePosition(layer, dX, dY, options = {}) {
                const { round } = options;
                if (round) {
                    layer.position.x = Math.round(layer.position.x + dX);
                    layer.position.y = Math.round(layer.position.y + dY);
                } else {
                    layer.position.x += dX;
                    layer.position.y += dY;
                }
                layer.element.style.transform = `translate3d(${layer.position.x}px, ${layer.position.y}px, 0px) scale(${layer.scale})`;
            }
            function setRelativeScales(deltaScale) {
                for (const layer of layers) {
                    if (layer.isActive || layer.tiles.size) {
                        layer.position.x = ((layer.position.x - viewportHalfWidth)) * deltaScale + viewportHalfWidth;
                        layer.position.y = ((layer.position.y - viewportHalfHeight)) * deltaScale + viewportHalfHeight;
                        layer.scale *= deltaScale;
                        if (layer.scale < 0.0625) {
                            clearLayer(layer);
                            continue;
                        }
                        setRelativePosition(layer, 0, 0, { round: false });
                    }
                }
            }
            function zoom(zoomFactor, resetScale) {
                if (nextZoomLevel === layers[0].zoom) {
                    return;
                }
                const scaledTileSize = tileSize * layers[0].scale;
                const nextCenterTileX = (layers[0].origin.tileX + (viewportHalfWidth - layers[0].position.x) / scaledTileSize) * zoomFactor;
                const nextCenterTileY = (layers[0].origin.tileY + (viewportHalfHeight - layers[0].position.y) / scaledTileSize) * zoomFactor;

                clearLayer(layers[2]);

                layers[0].isActive = false;

                layers[0].element.classList.remove("top");
                layers[0].element.classList.add("middle");
                layers[1].element.classList.remove("middle");
                layers[2].element.classList.add("top");

                layers[2].zoom = nextZoomLevel;
                layers[2].scale = resetScale;
                setOrigin(layers[2], nextCenterTileX, nextCenterTileY);

                layers[2].isActive = true;

                layers.unshift(layers.pop());

                refresh();
            }
            function clearLayer(layer) {
                if (layer.tiles.size) {
                    for (const [id, value] of layer.tiles) {
                        if (value) {
                            const [canvas, ctx] = value;
                            canvas.classList.add("hidden");
                            layer.tileStorage.push([canvas, ctx]);
                        }
                    }
                    layer.tiles.clear();
                }
            }
            function refresh() {
                for (const layer of layers) {
                    if (layer.isActive || layer.tiles.size) {
                        const [tileX, tileY, gridLengthX, gridLengthY] = getView(layer);
                        if (layer.lastZoom === layer.zoom && layer.lastTileX === tileX && layer.lastTileY === tileY && layer.lastGridLengthX === gridLengthX && layer.lastGridLengthY === gridLengthY) {
                            continue
                        } else {
                            layer.lastZoom = layer.zoom;
                            layer.lastTileX = tileX;
                            layer.lastTileY = tileY;
                            layer.lastGridLengthX = gridLengthX;
                            layer.lastGridLengthY = gridLengthY;
                            painter.paint(layer, tileX, tileY, gridLengthX, gridLengthY, { useWorker: true });
                        }
                    }
                }
                updateAttributeCoordinates();

                function getView(layer) {
                    const scaledTileSize = tileSize * layer.scale;
                    const tileX = Math.floor(-(layer.position.x + viewportOffset) / (scaledTileSize));
                    const tileY = Math.floor(-(layer.position.y + viewportOffset) / (scaledTileSize));
                    const fracX = (-(layer.position.x + viewportOffset) % (scaledTileSize) + (scaledTileSize)) % (scaledTileSize);
                    const fracY = (-(layer.position.y + viewportOffset) % (scaledTileSize) + (scaledTileSize)) % (scaledTileSize);
                    const gridLengthX = Math.ceil((fracX + viewportWidth + 2 * viewportOffset) / (scaledTileSize));
                    const gridLengthY = Math.ceil((fracY + viewportHeight + 2 * viewportOffset) / (scaledTileSize));
                    return [tileX, tileY, gridLengthX, gridLengthY];
                }
                function updateAttributeCoordinates() {
                    const { longitude, latitude } = getCoordinates();
                    kortjs.setAttribute("data-get-latitude", latitude);
                    kortjs.setAttribute("data-get-longitude", longitude);
                    kortjs.setAttribute("data-get-zoom", layers[0].zoom);
                }
            }
            function move(x, y, isRound) {
                setRelativePosition(layers[0], x, y, { round: isRound });
                for (let i = 1; i < layers.length; i++) {
                    if (layers[i].tiles.size) {
                        setRelativePosition(layers[i], x, y, { round: isRound });
                    }
                }
                refresh();
            }
            function pinch(deltaScale) {
                layers[0].isActive = false;
                let nextScale = layers[0].scale * deltaScale;
                if ((nextScale > 1 && layers[0].zoom === 19) || (nextScale < 1 && layers[0].zoom === 0)) {
                    return;
                }

                let adjustedDeltaScale = deltaScale;
                if (nextScale >= 2 && layers[0].zoom === 18) {
                    adjustedDeltaScale = 2 / layers[0].scale;
                } else if (nextScale <= 0.5 && layers[0].zoom === 1) {
                    adjustedDeltaScale = 0.5 / layers[0].scale;
                }
                setRelativeScales(adjustedDeltaScale);

                if (layers[0].scale >= 2 || layers[0].scale <= 0.5) {
                    let zoomDirection;
                    let zoomFactor;
                    if (layers[0].scale >= 2) {
                        zoomDirection = 1;
                        zoomFactor = 2;
                    } else {
                        zoomDirection = -1;
                        zoomFactor = 0.5;
                    }
                    nextZoomLevel = layers[0].zoom + zoomDirection;
                    zoom(zoomFactor, layers[0].scale / zoomFactor);
                } else {
                    refresh();
                }
            }
            function addTile(id, bitmap, tileX, tileY) {
                if (layers[0].tiles.has(id)) {
                    if (layers[0].tileStorage.length) {
                        const [canvas, ctx] = layers[0].tileStorage.pop();

                        canvas.classList.remove("hidden");

                        ctx.transferFromImageBitmap(bitmap);
                        canvas.style.transform = `translate3d(${tileX * tileSize}px, ${tileY * tileSize}px, 0px)`;

                        layers[0].tiles.set(id, [canvas, ctx]);
                        canvas.animate(
                            { opacity: 0, offset: 0 },
                            { duration: 300 }
                        );
                    } else {
                        const canvas = document.createElement('canvas');
                        const ctx = canvas.getContext("bitmaprenderer");
                        canvas.width = config.getTileSize();
                        canvas.height = config.getTileSize();
                        layers[0].element.appendChild(canvas);

                        ctx.transferFromImageBitmap(bitmap);
                        canvas.style.transform = `translate3d(${tileX * tileSize}px, ${tileY * tileSize}px, 0px)`;

                        layers[0].tiles.set(id, [canvas, ctx]);
                        canvas.animate(
                            { opacity: 0, offset: 0 },
                            { duration: 300 }
                        );
                    }
                }
            }
            function setAbsoluteScales(absoluteScale) {
                if (absoluteScale === 1) {
                    layers[0].isActive = true;
                } else {
                    layers[0].isActive = false;
                }
                const deltaScale = absoluteScale / layers[0].scale;
                setRelativeScales(deltaScale);
            }
            function getAbsoluteScale() {
                return layers[0].scale;
            }
            function changeZoomLevel(direction) {
                const zoomLevel = nextZoomLevel + direction;
                if (zoomLevel > 19 || zoomLevel < 1) {
                    return false;
                } else {
                    nextZoomLevel += direction;
                    return true;
                }
            }
            function getCoordinates() {
                const n = 2 ** layers[0].zoom;
                const scaledTileSize = tileSize * layers[0].scale;
                const centerTileX = ((layers[0].origin.tileX + (viewportHalfWidth - layers[0].position.x) / scaledTileSize) % n + n) % n;
                const centerTileY = ((layers[0].origin.tileY + (viewportHalfHeight - layers[0].position.y) / scaledTileSize) % n + n) % n;
                const longitude = 360 * centerTileX / n - 180;
                const latitude = Math.atan(Math.sinh(Math.PI - 2 * Math.PI * centerTileY / n)) * 180 / Math.PI;
                return { longitude, latitude }
            }
            function addCenterMarker() {
                const element = slotMarker.assignedNodes()[0]?.cloneNode("deep");
                element.setAttribute("class", "default-marker");
                viewportElement.append(element);

                const { width, height } = element.getBoundingClientRect();
                const offsetX = parseFloat(element.dataset.offsetx) || -width / 2;
                const offsetY = parseFloat(element.dataset.offsety) || -height;

                element.style.transform = `translate3d(${viewportHalfWidth + offsetX}px, ${viewportHalfHeight + offsetY}px, 0px)`;
            }
            return { move, pinch, addTile, getAbsoluteScale, setAbsoluteScales, zoom, changeZoomLevel }
        })();

        const mover = (() => {
            const glideStartThreshold = 0.2;
            const glideContinueThreshold = 0.05;
            const glideTimeConstant = 2000;
            const dragTimeConstant = 32;
            const wheelScaleDuration = 250;
            const snapScaleDuration = 250;
            const pointers = new Map();
            const doubleTapDistX = 50;
            const doubleTapDistY = 50;
            const doubleTapTime = 250;
            let cancelScale;
            let cancelDrag;
            let cancelGlide;
            let cancelPinch;
            let startDragX;
            let startDragY;
            let velocityX;
            let velocityY;
            let glideStartTime;
            let isScaling;
            let scaleEnd;
            let doubleTap = [0, 0, 0];

            viewportElement.addEventListener("pointerdown", pointerDown);
            viewportElement.addEventListener("wheel", mouseWheelZoom, { passive: false });

            function pointerDown(event) {
                switch (pointers.size) {
                    case 0:
                        viewportElement.style.cursor = "grabbing";
                        if (isDoubleTap(event)) {
                            doubleTapZoom();
                        }
                        cancelAnimationFrame(cancelGlide);
                        pointers.set(event.pointerId, [event.clientX, event.clientY]);
                        startDragX = event.clientX;
                        startDragY = event.clientY;
                        velocityX = 0;
                        velocityY = 0;

                        document.addEventListener("pointerup", pointerUp);
                        document.addEventListener("pointermove", pointerMove);
                        cancelDrag = requestAnimationFrame(frameTime => {
                            drag(frameTime, performance.now(), 0, 0);
                        });
                        break;
                    case 1:
                        cancelAnimationFrame(cancelScale);
                        cancelAnimationFrame(cancelDrag);
                        pointers.set(event.pointerId, [event.clientX, event.clientY]);
                        const [pointerA, pointerB] = [...pointers.values()];
                        const pinchStartDistance = Math.sqrt((pointerA[0] - pointerB[0]) ** 2 + (pointerA[1] - pointerB[1]) ** 2);
                        cancelPinch = requestAnimationFrame(frameTime => {
                            pinch(frameTime, pinchStartDistance);
                        });
                        break;
                    default:
                        console.log("Ignoring input");
                }
            }
            function pointerMove(event) {
                if (pointers.has(event.pointerId)) {
                    pointers.set(event.pointerId, [event.clientX, event.clientY]);
                }
            }
            function pointerUp(event) {
                if (pointers.has(event.pointerId)) {
                    pointers.delete(event.pointerId);
                    if (pointers.size) {
                        cancelAnimationFrame(cancelPinch);
                        snapScale();
                        [startDragX, startDragY] = [...pointers.values()][0];
                        velocityX = 0;
                        velocityY = 0;
                        cancelDrag = requestAnimationFrame(frameTime => {
                            drag(frameTime, performance.now(), 0, 0);
                        });
                    } else {
                        viewportElement.style.cursor = "grab";
                        cancelAnimationFrame(cancelDrag);
                        document.removeEventListener("pointerup", pointerUp);
                        document.removeEventListener("pointermove", pointerMove);
                        if (Math.sqrt(velocityX ** 2 + velocityY ** 2) > glideStartThreshold) {
                            glideStartTime = performance.now();
                            cancelGlide = requestAnimationFrame(frameTime => {
                                glide(frameTime, glideStartTime);
                            });
                        }
                    }
                } else {
                    console.log("Ignoring input");
                }
            }
            function drag(time, previousTime, previousX, previousY) {
                // Is there a way to get around using startDragX and Y?
                const dT = time - previousTime;
                const [pointerX, pointerY] = [...pointers.values()][0];
                const nextX = pointerX - startDragX;
                const nextY = pointerY - startDragY;
                const deltaX = nextX - previousX;
                const deltaY = nextY - previousY;

                if (dT > 0) {
                    const smoothingFactor = 1 - Math.exp(-dT / dragTimeConstant);
                    velocityX = smoothingFactor * deltaX / dT + (1 - smoothingFactor) * velocityX;
                    velocityY = smoothingFactor * deltaY / dT + (1 - smoothingFactor) * velocityY;
                }

                cancelDrag = requestAnimationFrame(frameTime => {
                    drag(frameTime, time, nextX, nextY);
                });

                map.move(deltaX, deltaY, true);
            }
            function glide(time, previousTime) {
                const dT = time - previousTime;
                const decayFactor = Math.exp(-(previousTime - glideStartTime) / glideTimeConstant);

                const x = decayFactor * velocityX * dT;
                const y = decayFactor * velocityY * dT;

                let isRound = true;
                if (decayFactor > glideContinueThreshold) {
                    isRound = false;
                    cancelGlide = requestAnimationFrame(frameTime => {
                        glide(frameTime, time);
                    });
                }
                map.move(x, y, isRound)
            }
            function pinch(time, previousDistance) {
                const [pointerA, pointerB] = [...pointers.values()];
                const distance = Math.sqrt((pointerA[0] - pointerB[0]) ** 2 + (pointerA[1] - pointerB[1]) ** 2);
                map.pinch(distance / previousDistance);

                cancelPinch = requestAnimationFrame(frameTime => {
                    pinch(frameTime, distance);
                });
            }
            function snapScale() {
                cancelAnimationFrame(cancelScale);
                const scaleStart = map.getAbsoluteScale();

                let direction;
                if (scaleStart < 0.75) {
                    scaleEnd = 0.5;
                    direction = -1;
                } else if (scaleStart > 1.5) {
                    scaleEnd = 2;
                    direction = 1;
                } else {
                    scaleEnd = 1;
                    direction = 0;
                }

                if (map.changeZoomLevel(direction)) {
                    animateScale(scaleStart, snapScaleDuration);
                }
            }
            function doubleTapZoom() {
                const scaleFactor = 2;
                if (map.changeZoomLevel(1)) {
                    const scaleStart = map.getAbsoluteScale();
                    if (isScaling) {
                        scaleEnd *= scaleFactor;
                    } else {
                        isScaling = true;
                        scaleEnd = scaleFactor;
                    }
                    animateScale(scaleStart, 250)
                }
            }
            function mouseWheelZoom(event) {
                event.preventDefault();

                let direction;
                let scaleFactor;
                if (event.deltaY > 0) {
                    scaleFactor = 0.5;
                    direction = -1;
                } else {
                    scaleFactor = 2;
                    direction = 1;
                }

                if (map.changeZoomLevel(direction)) {
                    const scaleStart = map.getAbsoluteScale();
                    if (isScaling) {
                        scaleEnd *= scaleFactor;
                    } else {
                        isScaling = true;
                        scaleEnd = scaleFactor;
                    }
                    animateScale(scaleStart, wheelScaleDuration)
                }
            }
            function animateScale(scaleStart, duration) {
                cancelAnimationFrame(cancelScale);

                cancelScale = requestAnimationFrame(frameTime => {
                    animator(frameTime, frameTime, 0);
                });

                function animator(time, previousTime, previousElapsed) {
                    const elapsedTime = time - previousTime + previousElapsed;

                    if (elapsedTime < duration) {
                        const absoluteScale = scaleStart + (scaleEnd - scaleStart) * (1 - (1 - elapsedTime / duration) ** 3);
                        map.setAbsoluteScales(absoluteScale);
                        cancelScale = requestAnimationFrame(frameTime => {
                            animator(frameTime, time, elapsedTime);
                        });
                    } else {
                        isScaling = false;
                        map.setAbsoluteScales(scaleEnd);
                        map.zoom(scaleEnd, 1);
                    }
                }
            }
            function isDoubleTap(event) {
                if (Math.abs(doubleTap[0] - event.clientX) < doubleTapDistX && Math.abs(doubleTap[1] - event.clientY) < doubleTapDistY && Math.abs(doubleTap[2] - event.timeStamp) < doubleTapTime) {
                    return true;
                } else {
                    doubleTap = [event.clientX, event.clientY, event.timeStamp];
                    return false;
                }
            }
        })();
    }
}
customElements.define("kort-js", kortjs);