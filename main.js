const canvas = document.getElementById('myCanvas');
const ctx = canvas.getContext("2d");


const keys= {};
window.addEventListener("keypress", (event) => keys[event.key.toLowerCase()] = true);
window.addEventListener("keyup", (event) => keys[event.key.toLowerCase()] = false);
window.addEventListener("keypress", (event) => keys[event.key.toUpperCase()] = true);
window.addEventListener("keyup", (event) => keys[event.key.toUpperCase()] = false);



const mouse_position = {x: 0, y: 0};
window.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = e.client.x - rect.left;
    mouse.y = e.client.y - rect.top;
})

const player = {
    x: canvas.width / 2,
    y: canvas.height / 2,
    radius: 5,
    speed: 1,
    angle: 0,
};







function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}


gameloop()