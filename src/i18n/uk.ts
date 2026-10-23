export const uk = {
  today: {
    title: 'Мої завдання на сьогодні',
    parentButton: 'Батьки',
    active: 'Іде таймер',
    activeSessionError: 'Інше завдання вже виконується',
    empty: 'Немає завдань на сьогодні',
  },
  timer: {
    pause: 'Пауза',
    resume: 'Продовжити',
    addTime: '+5 хв',
    pauseLeft: 'Пауза: залишилось',
    awaiting: 'Очікує перевірки',
    showParent: 'Покажи батькам',
    verified: 'Молодець! Перевірено',
    back: 'Назад',
    autoResumed: 'Час паузи вичерпано. Таймер продовжено',
    completedAnnouncement: 'Час вийшов! Очікує перевірки',
    minuteLeft: 'залишилося',
  },
  status: {
    idle: 'Не розпочато',
    running: 'Триває',
    paused: 'Пауза',
    completed: 'Очікує перевірки',
    verified: 'Перевірено',
  },
  stub: {
    soon: 'Скоро',
  },
  loading: 'Завантаження...',
} as const;
