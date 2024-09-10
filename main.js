var canvas = document.getElementById("canvas");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

// GL (WebGL) bağlamını başlat
var gl = canvas.getContext('webgl');
if(!gl){
  console.error("WebGL başlatılamadı.");
}

//Zaman
var time = 0.0;

//************** Gölgelendirici (Shader) kaynakları **************

var vertexSource = `
attribute vec2 position;
void main() {
	gl_Position = vec4(position, 0.0, 1.0);
}
`;

var fragmentSource = `
precision highp float;

uniform float width;
uniform float height;
vec2 resolution = vec2(width, height);

uniform float time;

#define POINT_COUNT 8

vec2 points[POINT_COUNT];
const float speed = -0.5;
const float len = 0.25;
float intensity = 1.3;
float radius = 0.008;

//https://www.shadertoy.com/view/MlKcDD
//Karesel bir bezier eğrisine olan imzalı uzaklık
float sdBezier(vec2 pos, vec2 A, vec2 B, vec2 C){    
	vec2 a = B - A;
	vec2 b = A - 2.0*B + C;
	vec2 c = a * 2.0;
	vec2 d = A - pos;

	float kk = 1.0 / dot(b,b);
	float kx = kk * dot(a,b);
	float ky = kk * (2.0*dot(a,a)+dot(d,b)) / 3.0;
	float kz = kk * dot(d,a);      

	float res = 0.0;

	float p = ky - kx*kx;
	float p3 = p*p*p;
	float q = kx*(2.0*kx*kx - 3.0*ky) + kz;
	float h = q*q + 4.0*p3;

	if(h >= 0.0){ 
		h = sqrt(h);
		vec2 x = (vec2(h, -h) - q) / 2.0;
		vec2 uv = sign(x)*pow(abs(x), vec2(1.0/3.0));
		float t = uv.x + uv.y - kx;
		t = clamp( t, 0.0, 1.0 );

		// 1 kök
		vec2 qos = d + (c + b*t)*t;
		res = length(qos);
	}else{
		float z = sqrt(-p);
		float v = acos( q/(p*z*2.0) ) / 3.0;
		float m = cos(v);
		float n = sin(v)*1.732050808;
		vec3 t = vec3(m + m, -n - m, n - m) * z - kx;
		t = clamp( t, 0.0, 1.0 );

		// 3 kök
		vec2 qos = d + (c + b*t.x)*t.x;
		float dis = dot(qos,qos);
        
		res = dis;

		qos = d + (c + b*t.y)*t.y;
		dis = dot(qos,qos);
		res = min(res,dis);
		
		qos = d + (c + b*t.z)*t.z;
		dis = dot(qos,qos);
		res = min(res,dis);

		res = sqrt( res );
	}
    
	return res;
}


//http://mathworld.wolfram.com/HeartCurve.html
vec2 getHeartPosition(float t){
	return vec2(16.0 * sin(t) * sin(t) * sin(t),
							-(13.0 * cos(t) - 5.0 * cos(2.0*t)
							- 2.0 * cos(3.0*t) - cos(4.0*t)));
}

//https://www.shadertoy.com/view/3s3GDn
float getGlow(float dist, float radius, float intensity){
	return pow(radius/dist, intensity);
}

float getSegment(float t, vec2 pos, float offset, float scale){
	for(int i = 0; i < POINT_COUNT; i++){
		points[i] = getHeartPosition(offset + float(i)*len + fract(speed * t) * 6.28);
	}
    
	vec2 c = (points[0] + points[1]) / 2.0;
	vec2 c_prev;
	float dist = 10000.0;
    
	for(int i = 0; i < POINT_COUNT-1; i++){
		//https://tinyurl.com/y2htbwkm
		c_prev = c;
		c = (points[i] + points[i+1]) / 2.0;
		dist = min(dist, sdBezier(pos, scale * c_prev, scale * points[i], scale * c));
	}
	return max(0.0, dist);
}

void main(){
	vec2 uv = gl_FragCoord.xy/resolution.xy;
	float widthHeightRatio = resolution.x/resolution.y;
	vec2 centre = vec2(0.5, 0.5);
	vec2 pos = centre - uv;
	pos.y /= widthHeightRatio;
	//Kalbi ortalamak için yukarı kaydır
	pos.y += 0.02;
	float scale = 0.000015 * height;
	
	float t = time;
    
	//İlk segmenti al
  float dist = getSegment(t, pos, 0.0, scale);
  float glow = getGlow(dist, radius, intensity);
  
  vec3 col = vec3(0.0);

	//Beyaz çekirdek
  col += 10.0*vec3(smoothstep(0.003, 0.001, dist));
  //Pembe parıltı
  col += glow * vec3(1.0,0.05,0.3);
  
  //İkinci segmenti al
  dist = getSegment(t, pos, 3.4, scale);
  glow = getGlow(dist, radius, intensity);
  
  //Beyaz çekirdek
  col += 10.0*vec3(smoothstep(0.003, 0.001, dist));
  //Mavi parıltı
  col += glow * vec3(0.1,0.4,1.0);
        
	//Ton eşleme
	col = 1.0 - exp(-col);

	//Gama düzeltme
	col = pow(col, vec3(0.4545));

	//Ekrana çıktı
 	gl_FragColor = vec4(col,1.0);
}
`;

//************** Yardımcı fonksiyonlar **************

window.addEventListener('resize', onWindowResize, false);

function onWindowResize(){
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
	gl.viewport(0, 0, canvas.width, canvas.height);
  gl.uniform1f(widthHandle, window.innerWidth);
  gl.uniform1f(heightHandle, window.innerHeight);
}


//Gölgelendiriciyi derle ve kaynakla birleştir
function compileShader(shaderSource, shaderType){
  var shader = gl.createShader(shaderType);
  gl.shaderSource(shader, shaderSource);
  gl.compileShader(shader);
  if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)){
  	throw "Gölgelendirici derleme hatası: " + gl.getShaderInfoLog(shader);
  }
  return shader;
}

//https://codepen.io/jlfwong/pen/GqmroZ'den alınmıştır
//Attribute/uniform bulunamazsa yüksek sesle şikayet etmek için yardımcı
function getAttribLocation(program, name) {
  var attributeLocation = gl.getAttribLocation(program, name);
  if (attributeLocation === -1) {
  	throw 'Attribute ' + name + ' bulunamadı.';
  }
  return attributeLocation;
}

function getUniformLocation(program, name) {
  var attributeLocation = gl.getUniformLocation(program, name);
  if (attributeLocation === -1) {
  	throw 'Uniform ' + name + ' bulunamadı.';
  }
  return attributeLocation;
}

//************** Gölgelendiricileri oluştur **************

//Vertex ve fragment gölgelendiricileri oluştur
var vertexShader = compileShader(vertexSource, gl.VERTEX_SHADER);
var fragmentShader = compileShader(fragmentSource, gl.FRAGMENT_SHADER);

//Gölgelendirici programlarını oluştur
var program = gl.createProgram();
gl.attachShader(program, vertexShader);
gl.attachShader(program, fragmentShader);
gl.linkProgram(program);

gl.useProgram(program);

//Tüm kanvasa yayılan dikdörtgeni ayarla 
var vertexData = new Float32Array([
  -1.0,  1.0, 	// sol üst
  -1.0, -1.0, 	// sol alt
   1.0,  1.0, 	// sağ üst
   1.0, -1.0, 	// sağ alt
]);

//Veri tamponunu (vertex buffer) oluştur
var vertexDataBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, vertexDataBuffer);
gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STATIC_DRAW);

// Veri tamponundaki (vertex buffer) verinin düzeni
var positionHandle = getAttribLocation(program, 'position');

gl.enableVertexAttribArray(positionHandle);
gl.vertexAttribPointer(positionHandle,
  2, 				// x ve y'nin her biri bir konum olarak
  gl.FLOAT, // her biri kayan noktalı
  false, 	// normalize edilmemiş
  2 * 4, 	// her vertex 2 kayar nokta içerir
  0 				// dizinin başından
  );

//************** Zaman ve ekran boyutlarını geçirin **************

//Ekran boyutunu geç
var widthHandle = getUniformLocation(program, 'width');
var heightHandle = getUniformLocation(program, 'height');
gl.uniform1f(widthHandle, window.innerWidth);
gl.uniform1f(heightHandle, window.innerHeight);

//Zamanı geç
var timeHandle = getUniformLocation(program, 'time');

//************** Çizim döngüsü **************

function draw(){
	// Zamanı geç
	time += 0.01;
	gl.uniform1f(timeHandle, time);

	// Çiz
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  
  //Tekrar çiz
  requestAnimationFrame(draw);
}

draw();
