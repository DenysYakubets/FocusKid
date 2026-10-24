/**
 * C8 RED test — `Гучність мелодії` stepper + `Тест` preview on MascotSelectScreen
 * (JINGLE_DESIGN §3.3 testID table).
 *
 * RED on the pre-integration tree: `src/state/jingleStore.ts` /
 * `src/ui/hooks/useJingle.ts` do not exist, `uk.mascot.jingle*` strings are
 * absent and the screen renders no volume row.
 * @jest-environment node
 */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, cleanup, fireEvent } from '@testing-library/react-native';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { systemWallClock } from '../../services/clock/wallClock';
import { MascotSelectScreen } from '../MascotSelectScreen';
import { useJingleStore } from '../../state/jingleStore';
import { jingleSources } from '../../ui/jingleSources';
import { uk } from '../../i18n/uk';

jest.setTimeout(30000);

const audio = require('expo-audio') as {
  createAudioPlayer: jest.Mock;
  setAudioModeAsync: jest.Mock;
  __players: Array<{
    volume: number;
    play: jest.Mock;
    remove: jest.Mock;
    listeners: Array<{ event: string; cb: (status: unknown) => void }>;
  }>;
};

/** Simulates an app restart: in-memory store back to defaults, database kept. */
function restartJingleStore() {
  useJingleStore.setState({ volume: 0.5, enabled: true, hydrated: false });
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('C8 - jingle volume stepper + Test preview (JINGLE_DESIGN §3.3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    audio.__players.length = 0;
    restartJingleStore();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders the volume row with the default readout and steps 50% -> 60% -> 50%, persisted across a restart', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const first = await renderWithApp(<MascotSelectScreen />, {
      db,
      clock,
      wall: systemWallClock,
    });

    // V6 default 0.5 -> "Гучність мелодії: 50%" (readout is also the a11y label).
    const row = await first.findByTestId('jingle-volume');
    expect(row).toBeTruthy();
    expect(first.getByTestId('jingle-volume-value').props.accessibilityLabel).toBe(
      uk.mascot.jingleVolume(50)
    );
    expect(first.getByText(uk.mascot.jingleVolume(50))).toBeTruthy();

    // Steppers use spec a11y labels/roles.
    expect(first.getByTestId('jingle-volume-up').props.accessibilityLabel).toBe(
      uk.mascot.jingleVolumeStepUp
    );
    expect(first.getByTestId('jingle-volume-down').props.accessibilityLabel).toBe(
      uk.mascot.jingleVolumeStepDown
    );

    // INV-10: every new control is a >=48dp touch target.
    for (const id of ['jingle-volume-up', 'jingle-volume-down', 'jingle-test']) {
      const node = first.getByTestId(id);
      const resolved =
        typeof node.props.style === 'function' ? node.props.style({ pressed: false }) : node.props.style;
      const flat = StyleSheet.flatten(resolved) || {};
      expect(Math.max(flat.minWidth ?? 0, flat.width ?? 0)).toBeGreaterThanOrEqual(48);
      expect(Math.max(flat.minHeight ?? 0, flat.height ?? 0)).toBeGreaterThanOrEqual(48);
    }

    // +10% up, then back down: 50 -> 60 -> 50.
    await act(async () => {
      fireEvent.press(first.getByTestId('jingle-volume-up'));
    });
    await flush();
    expect(first.getByText(uk.mascot.jingleVolume(60))).toBeTruthy();

    await act(async () => {
      fireEvent.press(first.getByTestId('jingle-volume-down'));
    });
    await flush();
    expect(first.getByText(uk.mascot.jingleVolume(50))).toBeTruthy();

    // Step once more, then restart the store so only the DB can restore it.
    await act(async () => {
      fireEvent.press(first.getByTestId('jingle-volume-up'));
    });
    await flush();
    first.unmount();
    restartJingleStore();

    const second = await renderWithApp(<MascotSelectScreen />, {
      db,
      clock,
      wall: systemWallClock,
    });
    await flush();
    expect(second.getByText(uk.mascot.jingleVolume(60))).toBeTruthy();
    expect(useJingleStore.getState().volume).toBeCloseTo(0.6, 5);
    second.unmount();
  });

  it('Test plays the previewed mascot jingle at the chosen volume (map follows the tapped card)', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const screen = await renderWithApp(<MascotSelectScreen />, {
      db,
      clock,
      wall: systemWallClock,
    });
    await flush();

    // Default preview = persisted mascot (Bubblo), default volume 0.5.
    expect(screen.getByTestId('jingle-test').props.accessibilityLabel).toBe(uk.mascot.jingleTest);
    await act(async () => {
      fireEvent.press(screen.getByTestId('jingle-test'));
    });
    await flush();
    expect(audio.createAudioPlayer).toHaveBeenCalledTimes(1);
    expect(audio.createAudioPlayer).toHaveBeenCalledWith(jingleSources.Bubblo);
    expect(audio.__players[0]?.volume).toBeCloseTo(0.5, 5);
    expect(audio.__players[0]?.play).toHaveBeenCalledTimes(1);

    // Preview another mascot: the jingle map must follow the shown card.
    await act(async () => {
      fireEvent.press(screen.getByLabelText(uk.mascot.cardLabel('Spark')));
    });
    await flush();
    await act(async () => {
      fireEvent.press(screen.getByTestId('jingle-test'));
    });
    await flush();
    expect(audio.createAudioPlayer).toHaveBeenCalledTimes(2);
    expect(audio.createAudioPlayer).toHaveBeenLastCalledWith(jingleSources.Spark);

    // Volume chosen in the UI is the volume it plays at (50 -> 40 via -10%).
    await act(async () => {
      fireEvent.press(screen.getByTestId('jingle-volume-down'));
    });
    await flush();
    await act(async () => {
      fireEvent.press(screen.getByTestId('jingle-test'));
    });
    await flush();
    expect(audio.createAudioPlayer).toHaveBeenCalledTimes(3);
    expect(audio.__players[2]?.volume).toBeCloseTo(0.4, 5);

    screen.unmount();
  });

  it('jingle_enabled=false disables the Test button (no playback possible)', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const first = await renderWithApp(<MascotSelectScreen />, {
      db,
      clock,
      wall: systemWallClock,
    });
    await first.services.settingsRepo.set('@focuskid/jingle_enabled', 'false');
    first.unmount();
    restartJingleStore();

    const screen = await renderWithApp(<MascotSelectScreen />, {
      db,
      clock,
      wall: systemWallClock,
    });
    await flush();
    expect(screen.getByTestId('jingle-test').props.accessibilityState?.disabled).toBe(true);
    screen.unmount();
  });

  it('shows jingle-save-error and keeps the old value when the settings write fails', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const screen = await renderWithApp(<MascotSelectScreen />, {
      db,
      clock,
      wall: systemWallClock,
    });
    await flush();
    expect(screen.queryByTestId('jingle-save-error')).toBeNull();

    jest
      .spyOn(screen.services.settingsRepo, 'set')
      .mockRejectedValueOnce(new Error('disk full'));

    await act(async () => {
      fireEvent.press(screen.getByTestId('jingle-volume-up'));
    });
    await flush();

    const error = await screen.findByTestId('jingle-save-error');
    expect(error).toBeTruthy();
    expect(screen.getByText(uk.mascot.jingleSaveError)).toBeTruthy();
    // Rolled back: still 50%, never a lying 60%.
    expect(screen.getByText(uk.mascot.jingleVolume(50))).toBeTruthy();

    screen.unmount();
  });
});