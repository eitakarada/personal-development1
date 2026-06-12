(function(){
    const canvas = document.createElement('canvas');
    canvas.id = 'starfield';
    document.body.prepend(canvas);
    const ctx = canvas.getContext('2d');
    let stars = [];
    let w = 0, h = 0, dpr = 1;

    function resize(){
        dpr = Math.max(1, window.devicePixelRatio || 1);
        w = Math.max(1, window.innerWidth);
        h = Math.max(1, window.innerHeight);
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        ctx.setTransform(dpr,0,0,dpr,0,0);
    }

    function rand(a,b){ return a + Math.random()*(b-a); }

    function makeStar(x,y,size,vx,vy,alpha){
        return {x,y,size,vx,vy,alpha};
    }

    function init(count){
        stars = [];
        for(let i=0;i<count;i++){
            const size = rand(0.3,1.2);
            // gentle slow background stars (sparser)
            // ensure diagonal motion (left-down) instead of straight-down
            const vx = rand(-0.06, -0.02);
            const vy = Math.abs(vx) * rand(0.6, 1.2);
            stars.push(makeStar(rand(0,w), rand(0,h), size, vx, vy, rand(0.2,0.8)));
        }
    }

    let last = performance.now();
    function step(now){
        const dt = Math.min(40, now - last) / 16.666; // ~60fps scale
        last = now;
        ctx.clearRect(0,0,w,h);
        for(let i=stars.length-1;i>=0;i--){
            const s = stars[i];
            s.x += s.vx * dt * 60;
            s.y += s.vy * dt * 60;
            s.alpha += (Math.random()-0.5)*0.02;
            if(s.alpha < 0.2) s.alpha = 0.2;
            if(s.alpha > 1) s.alpha = 1;
            // draw as short streaks to avoid "雪"っぽさ
            ctx.beginPath();
            ctx.strokeStyle = `rgba(255,255,255,${s.alpha})`;
            ctx.lineWidth = Math.max(1, s.size*2);
            ctx.lineCap = 'round';
            // trail length proportional to speed and size
            const tx = s.x - s.vx * 8;
            const ty = s.y - s.vy * 8;
            ctx.moveTo(s.x, s.y);
            ctx.lineTo(tx, ty);
            ctx.stroke();
            // recycle
            if(s.y - s.size > h + 50 || s.x < -50 || s.x > w + 50){
                stars.splice(i,1);
            }
        }
        // keep baseline density
        const baseline = Math.round((w*h)/50000); // much sparser background
        while(stars.length < baseline){
            const vx = rand(-0.06, -0.02);
            const vy = Math.abs(vx) * rand(0.6, 1.2);
            stars.push(makeStar(rand(0,w), rand(0,h), rand(0.3,1.0), vx, vy, rand(0.2,0.7)));
        }
        requestAnimationFrame(step);
    }

    function spawnStream(){
        // spawn a directional burst from top-right moving to bottom-left
        const angle = rand(Math.PI*0.7, Math.PI*0.85); // around 135deg (left-down)
        const speedBase = rand(1.2,2.2);
        const count = Math.round(rand(6,12)); // fewer per stream
        const startX = rand(w*0.8, 1.05*w); // start near right edge
        for(let i=0;i<count;i++){
            const size = rand(0.6,1.6);
            const spread = rand(-w*0.06, w*0.06);
            const x = startX + spread;
            const y = rand(-60, h*0.12);
            const vx = Math.cos(angle) * speedBase * rand(0.9,1.2);
            const vy = Math.sin(angle) * speedBase * rand(0.9,1.3);
            stars.push(makeStar(x,y,size,vx,vy, rand(0.6,1)));
        }
    }

    window.addEventListener('resize', resize);
    resize();
    init(Math.round((w*h)/50000));
    requestAnimationFrame(step);
    // periodic streams ~2 times per 10s
    spawnStream();
    setInterval(spawnStream, 5000);
})();
