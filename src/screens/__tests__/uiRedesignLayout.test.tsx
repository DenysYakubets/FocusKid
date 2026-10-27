/** @jest-environment node */
import React from 'react';
import { StyleSheet } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { AppText } from '../../ui/components/AppText';
import { AppButton } from '../../ui/components/AppButton';
import { NoticeBox } from '../../ui/components/NoticeBox';
import { StatusChip } from '../../ui/components/StatusChip';
import { PinPad } from '../../ui/components/PinPad';
import { TimerScreen } from '../TimerScreen';
import { TaskEditScreen } from '../TaskEditScreen';
import {
  colors,
  fontScaleMax,
  radius,
  statusColors,
  typography,
} from '../../ui/theme';
import { createFakeClock } from '../../../test/helpers/fakeClock';
import { createNodeDb } from '../../../test/helpers/nodeDb';
import { systemWallClock } from '../../services/clock/wallClock';
import { renderWithApp } from '../../../test/helpers/renderWithApp';
import { timerStore } from '../../state/timerStore';
import { uk } from '../../i18n/uk';
import { CONTENT_MAX_WIDTH } from '../../ui/hooks/useScreenGutter';
import { readFileSync } from 'fs';

function flat(node: any) {
  const styleProp = node.props.style;
  const resolved =
    typeof styleProp === 'function' ? styleProp({ pressed: false }) : styleProp;
  return StyleSheet.flatten(resolved) || {};
}

describe('UI redesign layout pins (UI_REDESIGN_SPEC §4-§5)', () => {
  jest.setTimeout(30000);

  it('AppText: scaling stays on and each role gets its maxFontSizeMultiplier', async () => {
    const bodyScreen = await render(<AppText variant="body">body-scale</AppText>);
    const body = bodyScreen.getByText('body-scale');
    expect(body.props.allowFontScaling).not.toBe(false);
    expect(body.props.maxFontSizeMultiplier).toBe(fontScaleMax.text); // 16 x 3.0 = 48sp
    expect(flat(body).fontSize).toBe(typography.body);

    const titleScreen = await render(<AppText variant="title">title-scale</AppText>);
    const title = titleScreen.getByText('title-scale');
    expect(title.props.maxFontSizeMultiplier).toBe(fontScaleMax.chrome); // chrome cap 2.0

    const timerScreen = await render(<AppText variant="timer">timer-scale</AppText>);
    const timer = timerScreen.getByText('timer-scale');
    expect(timer.props.maxFontSizeMultiplier).toBe(fontScaleMax.timer); // timer cap 1.2
    expect(flat(timer).fontSize).toBe(typography.timer);
  });

  it('PinPad: keys have no maxWidth cap, stay >=48dp, grid keeps flex:1', async () => {
    const screen = await render(
      <PinPad onComplete={jest.fn()} value="" onChange={jest.fn()} />
    );

    for (let d = 0; d <= 9; d++) {
      const keyStyle = flat(screen.getByLabelText(uk.pin.digit(d)));
      expect(keyStyle.maxWidth).toBeUndefined(); // §0.2 root cause: no cap
      expect(keyStyle.minHeight ?? 0).toBeGreaterThanOrEqual(48);
      expect(keyStyle.minWidth ?? 0).toBeGreaterThanOrEqual(48);
      expect(keyStyle.borderColor).toBe(colors.borderStrong);
    }

    expect(flat(screen.getByTestId('pinpad-grid')).flex).toBe(1);
    expect(screen.getByLabelText(uk.pin.backspace)).toBeTruthy();
  });

  it('AppButton variants resolve to theme tokens and honour disabled', async () => {
    const secondary = await render(
      <AppButton label="Secondary" variant="secondary" onPress={jest.fn()} />
    );
    const secondaryStyle = flat(secondary.getByLabelText('Secondary'));
    expect(secondaryStyle.backgroundColor).toBe(colors.surfaceAlt);
    expect(secondaryStyle.borderColor).toBe(colors.borderStrong);

    const success = await render(
      <AppButton label="Success" variant="success" onPress={jest.fn()} />
    );
    expect(flat(success.getByLabelText('Success')).backgroundColor).toBe(
      colors.verified
    );

    const disabledBtn = await render(
      <AppButton label="Off" variant="primary" disabled onPress={jest.fn()} />
    );
    expect(disabledBtn.getByLabelText('Off').props.accessibilityState.disabled).toBe(
      true
    );
  });

  it('NoticeBox tones and StatusChip pills use the token pairs', async () => {
    const err = await render(
      <NoticeBox tone="error" message="Boom" testID="notice-error" />
    );
    expect(flat(err.getByText('Boom')).color).toBe(colors.dangerText);
    expect(
      StyleSheet.flatten(err.getByTestId('notice-error').props.style).backgroundColor
    ).toBe(colors.dangerBg);

    const warn = await render(
      <NoticeBox tone="warning" message="Locked" testID="notice-warning" />
    );
    expect(
      StyleSheet.flatten(warn.getByTestId('notice-warning').props.style).backgroundColor
    ).toBe(colors.warningBg);

    const chip = await render(<StatusChip status="active" />);
    const chipLabel = chip.getByText(uk.today.active);
    const pill = StyleSheet.flatten(chipLabel.parent!.props.style);
    expect(pill.backgroundColor).toBe(statusColors.active.bg);
    expect(pill.borderRadius).toBe(radius.full);
  });

  it('Timer bottom action row: flex buttons without the 140dp minWidth clip (§0.3)', async () => {
    const db = createNodeDb();
    const clock = createFakeClock(1000);
    const mockNav: any = {
      navigate: jest.fn(),
      goBack: jest.fn(),
      addListener: jest.fn(() => () => {}),
    };

    const { getByLabelText } = await renderWithApp(
      <TimerScreen navigation={mockNav} route={{ params: { taskId: 1 } } as any} />,
      { db, clock, wall: systemWallClock }
    );

    await act(async () => {
      await timerStore.start(1);
    });

    for (const label of [uk.timer.pause, uk.timer.gear]) {
      const style = flat(getByLabelText(label));
      expect(style.flex).toBe(1);
      // 2 x minWidth 140 + 16 gap = 296 > 288 content at 320dp was the defect
      expect(style.minWidth ?? 0).toBeLessThanOrEqual(48);
      expect(style.minHeight ?? 0).toBeGreaterThanOrEqual(48);
    }
  });

  it('TaskEdit form max-width has a single source of truth in CONTENT_MAX_WIDTH.form (round-1 finding 3)', async () => {
    // Spec §1.1: one source of truth — no second 560 constant in a screen.
    const src = readFileSync('src/screens/TaskEditScreen.tsx', 'utf8');
    expect(src).not.toMatch(/\b560\b/);
    expect(src).toContain('CONTENT_MAX_WIDTH.form');

    // The rendered form still caps at the §3.6 forms width.
    const db = createNodeDb();
    const clock = createFakeClock(1000);
    const setup = await renderWithApp(<></>, { db, clock, wall: systemWallClock });
    await setup.services.authService.setupPin('1234');
    setup.services.authService.startParentSession();

    const screen = await renderWithApp(
      <TaskEditScreen
        navigation={{ goBack: jest.fn(), replace: jest.fn() } as any}
        route={{ params: {} } as any}
      />,
      { db, clock, wall: systemWallClock, services: setup.services }
    );

    let node: any = screen.getByTestId('task-title-input');
    while (node && node.props.contentContainerStyle === undefined) node = node.parent;
    expect(node).toBeTruthy();
    const formStyle = StyleSheet.flatten(node.props.contentContainerStyle);
    expect(formStyle.maxWidth).toBe(CONTENT_MAX_WIDTH.form);
    expect(CONTENT_MAX_WIDTH.form).toBe(560); // §3.6 forms cap
  });
});
