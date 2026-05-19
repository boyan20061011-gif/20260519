let capture;

function setup() {
  createCanvas(windowWidth, windowHeight);
  capture = createCapture(VIDEO);
  capture.hide();
}

function draw() {
  background('#e7c6ff');

  let vW = width * 0.5;
  let vH = height * 0.5;

  push();
  // 執行水平翻轉（左右顛倒）
  translate(width, 0);
  scale(-1, 1);

  // 影像置中顯示
  imageMode(CENTER);
  image(capture, width / 2, height / 2, vW, vH);
  pop();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}
