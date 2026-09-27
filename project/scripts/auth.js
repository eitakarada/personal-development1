(function(){
    const API_BASE = '';

    function showMessage(el, text, type){
        if(!el) return;
        el.textContent = text;
        el.classList.remove('text-green-400','text-red-400','text-gray-300');
        if(type==='success') el.classList.add('text-green-400');
        else if(type==='error') el.classList.add('text-red-400');
        else el.classList.add('text-gray-300');
    }

    async function postJson(url, payload){
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        let data = {};
        try{
            data = await response.json();
        }catch(e){
            data = {};
        }

        if(!response.ok){
            throw new Error(data.message || '通信に失敗しました');
        }

        return data;
    }

    const registerForm = document.getElementById('registerForm');
    if(registerForm){
        registerForm.addEventListener('submit', async function(e){
            e.preventDefault();
            const username = (document.getElementById('usernameInput')?.value||'').trim();
            const email = (document.getElementById('emailInput')?.value||'').trim().toLowerCase();
            const password = document.getElementById('passwordInput')?.value||'';
            const msg = document.getElementById('regMessage');

            if(!username || !email || !password){
                showMessage(msg, 'すべての項目を入力してください', 'error');
                return;
            }

            try{
                const result = await postJson(`${API_BASE}/api/register`, { username, email, password });
                showMessage(msg, result.message || '登録に成功しました。ログインページへ移動します...', 'success');
                setTimeout(()=>{ location.href = '../auth/login.html'; }, 1200);
            }catch(error){
                showMessage(msg, error.message, 'error');
            }
        });
    }

    const loginForm = document.getElementById('loginForm');
    if(loginForm){
        loginForm.addEventListener('submit', async function(e){
            e.preventDefault();
            const email = (document.getElementById('emailInputLogin')?.value||'').trim().toLowerCase();
            const password = document.getElementById('passwordInputLogin')?.value||'';
            const msg = document.getElementById('loginMessage');

            if(!email || !password){
                showMessage(msg, 'メールアドレスとパスワードを入力してください', 'error');
                return;
            }

            try{
                const result = await postJson(`${API_BASE}/api/login`, { email, password });
                localStorage.setItem('session_user', JSON.stringify({
                    email: result.user.email,
                    username: result.user.username,
                    loggedAt: new Date().toISOString()
                }));
                showMessage(msg, 'ログイン成功。トップに戻ります...', 'success');
                setTimeout(()=>{ location.href = '../index.html'; }, 800);
            }catch(error){
                showMessage(msg, error.message, 'error');
            }
        });
    }
})();
