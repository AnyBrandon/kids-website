// trophies.js

document.addEventListener('DOMContentLoaded', () => {
    // Get trophies from localStorage (stored as JSON array)
    const trophies = JSON.parse(localStorage.getItem('trophies') || '[]');

    // Fortnite trophies
    if (trophies.includes('fortniteEasyTrophy')) {
        const fortniteEasy = document.querySelector('img[src="images/trophies/easyTrophy.png"]');
        fortniteEasy.style.opacity = '1';
        fortniteEasy.style.filter = 'none';
    }
    if (trophies.includes('fortniteMediumTrophy')) {
        const fortniteMedium = document.querySelector('img[src="images/trophies/mediumTrophy.png"]');
        fortniteMedium.style.opacity = '1';
        fortniteMedium.style.filter = 'none';
    }
    if (trophies.includes('fortniteHardTrophy')) {
        const fortniteHard = document.querySelector('img[src="images/trophies/hardTrophy.png"]');
        fortniteHard.style.opacity = '1';
        fortniteHard.style.filter = 'none';
    }
    if (trophies.includes('fortniteLegendaryTrophy')) {
        const fortniteLegendary = document.querySelector('img[src="images/trophies/legendaryTrophy.png"]');
        fortniteLegendary.style.opacity = '1';
        fortniteLegendary.style.filter = 'none';
    }

    // Barbie trophies
    const barbieSection = document.querySelectorAll('.game-section')[1];
    if (trophies.includes('barbieEasyTrophy')) {
        const barbieEasy = barbieSection.querySelector('img[src="images/trophies/easyTrophy.png"]');
        barbieEasy.style.opacity = '1';
        barbieEasy.style.filter = 'none';
    }
    if (trophies.includes('barbieMediumTrophy')) {
        const barbieMedium = barbieSection.querySelector('img[src="images/trophies/mediumTrophy.png"]');
        barbieMedium.style.opacity = '1';
        barbieMedium.style.filter = 'none';
    }
    if (trophies.includes('barbieHardTrophy')) {
        const barbieHard = barbieSection.querySelector('img[src="images/trophies/hardTrophy.png"]');
        barbieHard.style.opacity = '1';
        barbieHard.style.filter = 'none';
    }
    if (trophies.includes('barbieLegendaryTrophy')) {
        const barbieLegendary = barbieSection.querySelector('img[src="images/trophies/legendaryTrophy.png"]');
        barbieLegendary.style.opacity = '1';
        barbieLegendary.style.filter = 'none';
    }
});
