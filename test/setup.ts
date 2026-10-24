/// <reference types="jest" />
import '@testing-library/react-native';
import React from 'react';

// C8: expo-audio is a native module — Jest must never load it for real. The
// mock records every created player so tests can assert the source, the
// volume and the unload path without touching native audio.
jest.mock('expo-audio', () => {
  type MockPlayer = {
    volume: number;
    playing: boolean;
    play: jest.Mock;
    pause: jest.Mock;
    remove: jest.Mock;
    addListener: jest.Mock;
    listeners: Array<{ event: string; cb: (status: unknown) => void }>;
  };
  const players: MockPlayer[] = [];
  const createAudioPlayer = jest.fn((): MockPlayer => {
    const listeners: MockPlayer['listeners'] = [];
    const player: MockPlayer = {
      volume: 1,
      playing: false,
      play: jest.fn(() => {
        player.playing = true;
      }),
      pause: jest.fn(() => {
        player.playing = false;
      }),
      remove: jest.fn(),
      addListener: jest.fn((event: string, cb: (status: unknown) => void) => {
        listeners.push({ event, cb });
        return { remove: jest.fn() };
      }),
      listeners,
    };
    players.push(player);
    return player;
  });
  return {
    __esModule: true,
    createAudioPlayer,
    setAudioModeAsync: jest.fn(() => Promise.resolve()),
    __players: players,
  };
});

jest.mock('expo-keep-awake', () => ({
  activateKeepAwakeAsync: jest.fn().mockResolvedValue(undefined),
  deactivateKeepAwake: jest.fn().mockResolvedValue(undefined),
  useKeepAwake: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    SafeAreaConsumer: ({ children }: { children: (insets: typeof inset) => React.ReactNode }) => children(inset),
    useSafeAreaInsets: () => inset,
    SafeAreaInsetsContext: React.createContext(inset),
  };
});
