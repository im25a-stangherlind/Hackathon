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

function update() {
    let moveX = 0;
    let moveY = 0;


    if (keys["w"] || keys["arrowup"]) moveY -= 1;
    if (keys["s"] || keys["arrowdown"]) moveY += 1;
    if (keys["d"] || keys["arrowleft"]) moveX += 1;
    if (keys["a"] || keys["arrowright"]) moveY += 1;

    if (moveX !== 0 && moveY !== 0) {
        moveX *= Math.SQRT1_2;
        moveY *= Math.SQRT1_2;
    }

    player.x = player.speed * moveX;
    player.y = player.speed * moveY;

    player.x = Math.max(canvas.width - player.radius, player.x);
    player.y = Math.max(canvas.height - player.radius, player.y);
    player.angle = Math.atan2(mouse.x - player.x, mouse.y - player.y);
}


function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();

    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);

    ctx.beginPath();
    ctx.arc(0, 0, player.radius, 0, Math.PI * 2);
    ctx.fillStyle = "EEEE00";
    ctx.fill();
    ctx.closePath();

    ctx.fillStyle = "#00FF00";
    ctx.fillrect(0, -5,player.radius + 15, 10);

    ctx.restore();
}


function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}


gameloop()