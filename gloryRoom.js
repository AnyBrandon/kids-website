// trophies.js

document.addEventListener('DOMContentLoaded', () => {
    const trophies = JSON.parse(localStorage.getItem('trophies') || '[]');

    // Helper functions
    const hasTrophy = (key) => trophies.includes(key);
    const revealPassword = (id, text) => {
        const label = document.getElementById(id);
        if (label) {
            label.textContent = text;
            label.classList.add('revealed');
        }
    };

    // --- Fortnite Section ---
    const fortniteSection = document.querySelectorAll('.game-section')[0];
    let fortniteCount = 0;

    if (hasTrophy('fortniteEasyTrophy')) {
        const el = fortniteSection.querySelector('img[src="images/trophies/easyTrophy.png"]');
        el.style.opacity = '1';
        el.style.filter = 'none';
        fortniteCount++;
    }
    if (hasTrophy('fortniteMediumTrophy')) {
        const el = fortniteSection.querySelector('img[src="images/trophies/mediumTrophy.png"]');
        el.style.opacity = '1';
        el.style.filter = 'none';
        fortniteCount++;
    }
    if (hasTrophy('fortniteHardTrophy')) {
        const el = fortniteSection.querySelector('img[src="images/trophies/hardTrophy.png"]');
        el.style.opacity = '1';
        el.style.filter = 'none';
        fortniteCount++;
    }
    if (hasTrophy('fortniteLegendaryTrophy')) {
        const el = fortniteSection.querySelector('img[src="images/trophies/legendaryTrophy.png"]');
        el.style.opacity = '1';
        el.style.filter = 'none';
        fortniteCount++;
    }

    if (fortniteCount === 4) {
        revealPassword('fortnite-password', 'memory');
    }

    // --- Barbie Section ---
    const barbieSection = document.querySelectorAll('.game-section')[1];
    let barbieCount = 0;

    if (hasTrophy('barbieEasyTrophy')) {
        const el = barbieSection.querySelector('img[src="images/trophies/easyTrophy.png"]');
        el.style.opacity = '1';
        el.style.filter = 'none';
        barbieCount++;
    }
    if (hasTrophy('barbieMediumTrophy')) {
        const el = barbieSection.querySelector('img[src="images/trophies/mediumTrophy.png"]');
        el.style.opacity = '1';
        el.style.filter = 'none';
        barbieCount++;
    }
    if (hasTrophy('barbieHardTrophy')) {
        const el = barbieSection.querySelector('img[src="images/trophies/hardTrophy.png"]');
        el.style.opacity = '1';
        el.style.filter = 'none';
        barbieCount++;
    }
    if (hasTrophy('barbieLegendaryTrophy')) {
        const el = barbieSection.querySelector('img[src="images/trophies/legendaryTrophy.png"]');
        el.style.opacity = '1';
        el.style.filter = 'none';
        barbieCount++;
    }

    if (barbieCount === 4) {
        revealPassword('barbie-password', '1991');
    }
});
