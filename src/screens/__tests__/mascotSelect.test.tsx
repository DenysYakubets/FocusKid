/** @jest-environment node */
import React from 'react';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { systemWallClock } from '../../services/clock/wallClock';
import { MascotSelectScreen } from '../MascotSelectScreen';
import { useMascotStore } from '../../state/mascotStore';
import { DEFAULT_MASCOT } from '../../ui/theme';
import { uk } from '../../i18n/uk';

jest.setTimeout(30000);

/** Simulates an app restart: in-memory store back to defaults, database kept. */
function restartStore() {
  useMascotStore.setState({ mascot: DEFAULT_MASCOT, hydrated: false });
}

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('C5 - mascot selection screen (MASCOT_DESIGN §4)', () => {
  beforeEach(() => {
    restartStore();
  });

  it('renders all 7 mascots with uk title/hint and marks the default as selected', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const screen = await renderWithApp(<MascotSelectScreen />, {
      db,
      clock,
      wall: systemWallClock,
    });

    expect(await screen.findByText(uk.mascot.title)).toBeTruthy();
    expect(screen.getByText(uk.mascot.hint)).toBeTruthy();

    const names = ['Bubblo', 'Stella', 'Wobble', 'Aqua', 'Bud', 'Glow', 'Spark'];
    for (const name of names) {
      const card = await screen.findByLabelText(uk.mascot.cardLabel(name));
      expect(card.props.accessibilityRole).toBe('button');
      expect(card.props.accessibilityState?.selected).toBe(name === DEFAULT_MASCOT);
      // personality blurb comes from uk.ts, never hardcoded English in JSX
      // (shown both in the preview panel and on the card)
      expect(
        screen.getAllByText(uk.mascot.personalities[name as 'Bubblo']).length
      ).toBeGreaterThanOrEqual(1);
    }

    // INV-10: the card is a real touch target
    const cardStyle = screen.getByLabelText(uk.mascot.cardLabel('Bubblo')).props.style;
    const flat = require('react-native').StyleSheet.flatten(
      typeof cardStyle === 'function' ? cardStyle({ pressed: false }) : cardStyle
    );
    expect(Math.max(flat.minWidth ?? 0, flat.width ?? 0)).toBeGreaterThanOrEqual(48);
    expect(Math.max(flat.minHeight ?? 0, flat.height ?? 0)).toBeGreaterThanOrEqual(48);
  });

  it('picking a mascot persists across a remount (restart keeps the choice)', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const first = await renderWithApp(<MascotSelectScreen />, {
      db,
      clock,
      wall: systemWallClock,
    });

    await act(async () => {
      fireEvent.press(await first.findByLabelText(uk.mascot.cardLabel('Stella')));
    });
    await flush();
    expect(useMascotStore.getState().mascot).toBe('Stella');

    first.unmount();

    // App restart: fresh component + empty in-memory state, SAME database.
    restartStore();
    const second = await renderWithApp(<MascotSelectScreen />, {
      db,
      clock,
      wall: systemWallClock,
    });

    await waitFor(
      () => {
        expect(
          second.getByLabelText(uk.mascot.cardLabel('Stella')).props.accessibilityState
            ?.selected
        ).toBe(true);
      },
      { timeout: 3000 }
    );
    expect(
      second.getByLabelText(uk.mascot.cardLabel('Bubblo')).props.accessibilityState
        ?.selected
    ).toBe(false);
    expect(useMascotStore.getState().mascot).toBe('Stella');
  });

  it('tapping a card previews that mascot in the preview panel', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);

    const screen = await renderWithApp(<MascotSelectScreen />, {
      db,
      clock,
      wall: systemWallClock,
    });

    const preview = await screen.findByTestId('mascot-preview');
    expect(preview.props.accessibilityLabel).toContain(DEFAULT_MASCOT);

    await act(async () => {
      fireEvent.press(await screen.findByLabelText(uk.mascot.cardLabel('Wobble')));
    });
    await flush();

    const updated = screen.getByTestId('mascot-preview');
    expect(updated.props.accessibilityLabel).toContain('Wobble');
    expect(useMascotStore.getState().mascot).toBe('Wobble');
  });

  it('surfaces a persistence failure instead of an unhandled select() rejection (round-1 LOW)', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);
    const prep = await renderWithApp(<></>, { db, clock, wall: systemWallClock });
    const setSpy = jest
      .spyOn(prep.services.settingsRepo, 'set')
      .mockRejectedValue(new Error('disk full'));
    prep.unmount();

    const screen = await renderWithApp(<MascotSelectScreen />, {
      db,
      clock,
      wall: systemWallClock,
      services: prep.services,
    });

    await act(async () => {
      fireEvent.press(await screen.findByLabelText(uk.mascot.cardLabel('Stella')));
    });
    await flush();

    // The rejection is caught and shown through the app's NoticeBox.
    expect(await screen.findByTestId('mascot-save-error')).toBeTruthy();
    // The optimistic pick still rolls back (mascotStore keeps its rollback).
    expect(useMascotStore.getState().mascot).toBe(DEFAULT_MASCOT);
    expect(setSpy).toHaveBeenCalled();
  });
});