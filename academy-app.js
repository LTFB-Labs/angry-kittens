// @ts-check
// Сърдити котета inside LevAcademy: the shell loads this module in its sandboxed frame and calls mount().
// The game is the same as when it is opened alone (index.html); here its scores are kept by the shell for this child
// (appData 'scores', the child's own ranking) and cups give badges in the child's profile.
import { defineApp } from '../core/academy-core/app.js';
import { startGame } from './game.js';

/** Badges for cups knocked over in one game. */
const BADGES = {
  1: { code: 'first-cup', name: 'Първа чаша', icon: 'core:star', reason: 'Събори първата си чаша' },
  6: { code: 'degrees', name: 'Градуси', icon: 'core:medal-bronze', reason: 'Стигна до нивата с градуси' },
  15: { code: 'sharp-eye', name: 'Точно око', icon: 'core:medal-silver', reason: 'Събори 15 чаши в една игра' },
  25: { code: 'cup-master', name: 'Майстор на ъглите', icon: 'core:trophy', reason: 'Събори 25 чаши в една игра' },
};

export default defineApp({
  id: 'angry-kittens',
  name: 'Сърдити котета',
  description: 'Изстрелвай котета с прашка под точния ъгъл и събаряй чашата от масата.',
  icon: 'icon.svg',
  route: 'angry-kittens',
  contract: 2,
  permissions: ['user', 'settings', 'storage', 'badges'],

  async mount(el, core) {
    document.documentElement.lang = 'bg';
    document.title = 'Сърдити котета';
    document.head.append(Object.assign(document.createElement('link'), { rel: 'stylesheet', href: new URL('game.css', import.meta.url).href }));
    document.head.append(Object.assign(document.createElement('meta'), { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' }));

    const [user, settings] = await Promise.all([core.getUser(), core.getSettings()]);
    const earned = new Set(user && 'badges' in user ? user.badges.filter((b) => b.app === 'angry-kittens').map((b) => b.code) : []);

    return startGame(el, {
      sound: settings.sound,
      loadScores: () => core.appData.all('scores'),
      saveScore: (score) => core.appData.put('scores', { id: score.at, ...score }),
      onPoint(cups) {
        const badge = BADGES[cups];
        if (!badge || earned.has(badge.code)) return;
        earned.add(badge.code);
        core.grantUserBadge({ ...badge, description: 'Играта „Сърдити котета“' })
          .catch((error) => console.warn('Значката не се даде:', error));
      },
    });
  },
});
