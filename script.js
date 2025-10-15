document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('game-container');
    const character = document.getElementById('character');
    const target = document.getElementById('target');
    const obstacles = Array.from(document.querySelectorAll('.obstacle'));
    const walls = Array.from(document.querySelectorAll('.wall'));
    const heart = document.getElementById('heart');
    const message = document.getElementById('message');
    const scoreElement = document.getElementById('score');
    const livesElement = document.getElementById('lives');
    const timeElement = document.getElementById('time');

    if (!container || !character || !target) {
        return;
    }

    const containerRect = container.getBoundingClientRect();
    const boundaries = {
        width: container.clientWidth,
        height: container.clientHeight
    };
    const characterSize = character.offsetWidth;
    const startRect = getRect(character);

    let characterPosition = { x: startRect.left, y: startRect.top };
    let lastFrameTime = performance.now();
    let lives = 3;
    let recovering = false;
    let gameRunning = true;
    let levelCompleted = false;
    let distanceTravelled = 0;
    let frozenElapsedSeconds = null;
    const startTime = performance.now();
    const originalMessage = message ? message.textContent : '';

    const speed = 220;
    const keys = {
        ArrowUp: false,
        ArrowDown: false,
        ArrowLeft: false,
        ArrowRight: false
    };

    const wallRects = walls.map(wall => {
        const style = window.getComputedStyle(wall);
        const top = parseFloat(style.top);
        const left = parseFloat(style.left);
        const width = parseFloat(style.width);
        const height = parseFloat(style.height);
        return {
            element: wall,
            top,
            left,
            right: left + width,
            bottom: top + height
        };
    });

    const obstacleStates = obstacles.map(obstacle => {
        const style = window.getComputedStyle(obstacle);
        const top = parseFloat(style.top);
        const left = parseFloat(style.left);
        const state = {
            element: obstacle,
            top,
            left,
            width: obstacle.offsetWidth,
            height: obstacle.offsetHeight,
            speed: 120,
            direction: 1
        };

        if (obstacle.classList.contains('obstacle-type2')) {
            const range = 160;
            state.speed = 180;
            state.minTop = Math.max(10, top - range);
            state.maxTop = Math.min(boundaries.height - state.height - 10, top + range);
        } else if (obstacle.classList.contains('obstacle-type3')) {
            const range = 200;
            state.speed = 200;
            state.minLeft = Math.max(10, left - range);
            state.maxLeft = Math.min(boundaries.width - state.width - 10, left + range);
        } else if (obstacle.classList.contains('obstacle-type1')) {
            state.speed = 140;
        }

        return state;
    });

    function getRect(element) {
        const rect = element.getBoundingClientRect();
        return {
            left: rect.left - containerRect.left,
            top: rect.top - containerRect.top,
            right: rect.right - containerRect.left,
            bottom: rect.bottom - containerRect.top
        };
    }

    function getStateRect(state) {
        return {
            left: state.left,
            top: state.top,
            right: state.left + state.width,
            bottom: state.top + state.height
        };
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function checkCollision(rect1, rect2) {
        return !(
            rect1.right <= rect2.left ||
            rect1.left >= rect2.right ||
            rect1.bottom <= rect2.top ||
            rect1.top >= rect2.bottom
        );
    }

    function getCharacterRect() {
        return {
            left: characterPosition.x,
            top: characterPosition.y,
            right: characterPosition.x + characterSize,
            bottom: characterPosition.y + characterSize
        };
    }

    function setCharacterPosition(x, y) {
        characterPosition.x = x;
        characterPosition.y = y;
        character.style.left = `${x}px`;
        character.style.top = `${y}px`;
    }

    function updateHud() {
        if (!scoreElement || !livesElement || !timeElement) {
            return;
        }
        const activeElapsed = frozenElapsedSeconds ?? Math.floor((performance.now() - startTime) / 1000);
        const minutes = String(Math.floor(activeElapsed / 60)).padStart(2, '0');
        const seconds = String(activeElapsed % 60).padStart(2, '0');
        const scoreValue = getScoreValue(activeElapsed);

        scoreElement.textContent = `Puan: ${scoreValue}`;
        livesElement.textContent = `Can: ${lives}`;
        timeElement.textContent = `Süre: ${minutes}:${seconds}`;
    }

    function getScoreValue(elapsedSeconds = frozenElapsedSeconds ?? Math.floor((performance.now() - startTime) / 1000)) {
        const travelPoints = Math.round(distanceTravelled / 4);
        const timePenalty = Math.floor(elapsedSeconds / 5);
        const survivalBonus = Math.max(0, (lives - 1) * 75);
        return Math.max(0, travelPoints + survivalBonus - timePenalty);
    }

    function setRecoveringState(state) {
        recovering = state;
        character.classList.toggle('recovering', state);
    }

    function resetCharacterPosition() {
        character.style.display = 'block';
        setCharacterPosition(startRect.left, startRect.top);
    }

    function createParticle(x, y) {
        const particle = document.createElement('div');
        particle.classList.add('particle');
        particle.style.left = `${x}px`;
        particle.style.top = `${y}px`;
        container.appendChild(particle);

        requestAnimationFrame(() => {
            const offsetX = (Math.random() - 0.5) * 180;
            const offsetY = (Math.random() - 0.5) * 180;
            const scale = 0.4 + Math.random() * 0.6;
            particle.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
            particle.style.opacity = '1';
        });

        setTimeout(() => {
            particle.remove();
        }, 700);
    }

    function explodeCharacter(x, y) {
        for (let i = 0; i < 18; i += 1) {
            createParticle(x + characterSize / 2, y + characterSize / 2);
        }
    }

    function triggerShake() {
        container.classList.add('shake');
        setTimeout(() => container.classList.remove('shake'), 500);
    }

    function detectCollisions(rect, { ignoreDanger = false } = {}) {
        const collision = {
            solid: false,
            danger: false
        };

        obstacleStates.forEach(state => {
            const obstacleRect = getStateRect(state);
            if (checkCollision(rect, obstacleRect)) {
                collision.danger = true;
                if (!ignoreDanger) {
                    collision.solid = true;
                }
            }
        });

        wallRects.forEach(wallRect => {
            if (checkCollision(rect, wallRect)) {
                collision.solid = true;
            }
        });

        const outsideLeft = rect.left < 0;
        const outsideRight = rect.right > boundaries.width;
        const outsideTop = rect.top < 0;
        const outsideBottom = rect.bottom > boundaries.height;

        if (outsideLeft || outsideRight || outsideTop || outsideBottom) {
            collision.solid = true;
        }

        return collision;
    }

    function handleDanger() {
        if (recovering || levelCompleted || !gameRunning) {
            return;
        }

        explodeCharacter(characterPosition.x, characterPosition.y);
        triggerShake();

        lives -= 1;
        updateHud();
        if (lives <= 0) {
            gameRunning = false;
            frozenElapsedSeconds = Math.floor((performance.now() - startTime) / 1000);
            updateHud();
            character.style.display = 'none';
            if (heart) {
                heart.classList.add('hidden');
            }
            if (message) {
                message.textContent = 'Çisem, macera burada bitmedi! Yeniden dene!';
                message.classList.remove('hidden');
            }
            setTimeout(() => {
                window.location.reload();
            }, 2800);
            return;
        }

        character.classList.add('hurt');
        setRecoveringState(true);
        if (heart) {
            heart.classList.add('hidden');
        }
        if (message) {
            message.classList.add('hidden');
        }

        setTimeout(() => {
            character.classList.remove('hurt');
        }, 600);

        setTimeout(() => {
            setRecoveringState(false);
        }, 1400);

        resetCharacterPosition();
    }

    function updateObstacles(delta) {
        if (levelCompleted) {
            return;
        }

        obstacleStates.forEach(state => {
            if (state.element.classList.contains('obstacle-type1')) {
                const dx = characterPosition.x - state.left;
                const dy = characterPosition.y - state.top;
                const distance = Math.hypot(dx, dy) || 1;
                const chaseSpeed = state.speed;
                state.left += (dx / distance) * chaseSpeed * delta;
                state.top += (dy / distance) * chaseSpeed * delta;
            } else if (state.element.classList.contains('obstacle-type2')) {
                state.top += state.direction * state.speed * delta;
                if (state.top >= state.maxTop) {
                    state.top = state.maxTop;
                    state.direction = -1;
                } else if (state.top <= state.minTop) {
                    state.top = state.minTop;
                    state.direction = 1;
                }
            } else if (state.element.classList.contains('obstacle-type3')) {
                state.left += state.direction * state.speed * delta;
                if (state.left >= state.maxLeft) {
                    state.left = state.maxLeft;
                    state.direction = -1;
                } else if (state.left <= state.minLeft) {
                    state.left = state.minLeft;
                    state.direction = 1;
                }
            }

            state.top = clamp(state.top, 0, boundaries.height - state.height);
            state.left = clamp(state.left, 0, boundaries.width - state.width);

            state.element.style.top = `${state.top}px`;
            state.element.style.left = `${state.left}px`;

            if (!recovering && checkCollision(getCharacterRect(), getStateRect(state))) {
                handleDanger();
            }
        });
    }

    function updateCharacter(delta) {
        if (!gameRunning) {
            return;
        }

        let vx = 0;
        let vy = 0;

        if (keys.ArrowUp) vy -= 1;
        if (keys.ArrowDown) vy += 1;
        if (keys.ArrowLeft) vx -= 1;
        if (keys.ArrowRight) vx += 1;

        if (vx === 0 && vy === 0) {
            return;
        }

        const magnitude = Math.hypot(vx, vy) || 1;
        vx /= magnitude;
        vy /= magnitude;

        const proposedX = characterPosition.x + vx * speed * delta;
        const proposedY = characterPosition.y + vy * speed * delta;

        const clampedX = clamp(proposedX, 0, boundaries.width - characterSize);
        const clampedY = clamp(proposedY, 0, boundaries.height - characterSize);

        const candidateRect = {
            left: clampedX,
            top: clampedY,
            right: clampedX + characterSize,
            bottom: clampedY + characterSize
        };

        const collision = detectCollisions(candidateRect, { ignoreDanger: recovering });

        if (collision.danger && !recovering) {
            handleDanger();
            return;
        }

        if (!collision.solid) {
            const distance = Math.hypot(clampedX - characterPosition.x, clampedY - characterPosition.y);
            distanceTravelled += distance;
            setCharacterPosition(clampedX, clampedY);
        }
    }

    function completeLevel() {
        if (levelCompleted) {
            return;
        }
        levelCompleted = true;
        gameRunning = false;
        frozenElapsedSeconds = Math.floor((performance.now() - startTime) / 1000);
        updateHud();
        Object.keys(keys).forEach(key => {
            keys[key] = false;
        });

        setRecoveringState(false);
        character.classList.remove('hurt');
        character.classList.add('celebrate');

        if (heart) {
            heart.classList.remove('hidden');
        }

        if (message) {
            const finalScore = getScoreValue(frozenElapsedSeconds);
            message.textContent = `${originalMessage}\nToplam Puanın: ${finalScore}`;
            message.classList.remove('hidden');
        }

        setTimeout(() => {
            const currentFile = window.location.pathname.split('/').pop();
            const next = currentFile === 'level2.html' ? 'index.html' : 'level2.html';
            window.location.href = next;
        }, 2600);
    }

    function gameLoop(timestamp) {
        const delta = (timestamp - lastFrameTime) / 1000;
        lastFrameTime = timestamp;

        if (gameRunning) {
            updateCharacter(delta);
            updateObstacles(delta);
        }

        if (!levelCompleted && checkCollision(getCharacterRect(), getRect(target))) {
            completeLevel();
        }

        updateHud();

        if (gameRunning || levelCompleted) {
            requestAnimationFrame(gameLoop);
        }
    }

    function onKeyDown(event) {
        if (!(event.key in keys) || levelCompleted) {
            return;
        }
        keys[event.key] = true;
        event.preventDefault();
    }

    function onKeyUp(event) {
        if (!(event.key in keys)) {
            return;
        }
        keys[event.key] = false;
        event.preventDefault();
    }

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    resetCharacterPosition();
    updateHud();
    requestAnimationFrame(gameLoop);
});
