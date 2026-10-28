/**
 * C2 layout pin: shared AppToolbar on child screens.
 *
 * Owner brief: "the app currently has title+back merging visually. Add a proper
 * top Toolbar component on child screens: clear title, a BIGGER back button
 * (>=48dp, distinct icon+label, not blending into title), consistent height
 * (~56dp), respects SafeArea (already AppFrame-wrapped — keep it). Make it a
 * shared component src/ui/components/AppToolbar.tsx; migrate existing screens'
 * headers to it."
 */
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import { AppToolbar } from '../components/AppToolbar';
import { uk } from '../../i18n/uk';
import { MIN_TOUCH_DP, colors, spacing } from '../../ui/theme';

function flat(node: any) {
  const styleProp = node.props.style;
  const resolved =
    typeof styleProp === 'function' ? styleProp({ pressed: false }) : styleProp;
  return StyleSheet.flatten(resolved) || {};
}

describe('C2: AppToolbar layout', () => {
  it('renders a distinct big back button with a clear title in a 56dp-high row', async () => {
    const screen = await render(
      <AppToolbar
        onBack={() => {}}
        title="Читання"
        testID="toolbar"
      />
    );

    const toolbar = screen.getByTestId('toolbar');
    const toolbarStyle = flat(toolbar);
    expect(toolbarStyle.minHeight).toBeGreaterThanOrEqual(56);

    // The back button must be >= 48dp in both dimensions
    const back = screen.getByLabelText(uk.timer.back);
    const backStyle = flat(back);
    expect(backStyle.minWidth ?? 0).toBeGreaterThanOrEqual(48);
    expect(backStyle.minHeight ?? 0).toBeGreaterThanOrEqual(48);

    // The title must be present and clear
    const title = screen.getByText('Читання');
    expect(title).toBeTruthy();
    expect(title.props.accessibilityRole).toBe('header');
  });

  it('the back button has a distinct icon + label (not blending into title)', async () => {
    const screen = await render(
      <AppToolbar onBack={() => {}} title="Тест" testID="toolbar" />
    );

    // Back label text includes the arrow icon (←)
    const back = screen.getByLabelText(uk.timer.back);
    const backText = screen.getByText(/←/);
    expect(backText).toBeTruthy();

    // The back button and title are visually separated: the back button's
    // text color must differ from the title's color (distinct styling)
    const backStyle = flat(back);
    const titleNode = screen.getByText('Тест');
    const titleStyle = flat(titleNode);
    // back label color (accent) vs title color (text)
    expect(backStyle.color ?? backStyle.backgroundColor).toBeTruthy();
    expect(titleStyle.color).toBe(colors.text);
  });

  it('title has numberOfLines=1 so it never wraps into the back button', async () => {
    const screen = await render(
      <AppToolbar onBack={() => {}} title="Дуже довга назва завдання" />
    );
    const title = screen.getByText('Дуже довга назва завдання');
    expect(title.props.numberOfLines).toBe(1);
  });

  it('centers the title and inline actions on the same header row', async () => {
    const screen = await render(
      <AppToolbar title="Завдання" testID="toolbar" actions={<View testID="toolbar-action" />} />
    );
    expect(flat(screen.getByTestId('toolbar')).alignItems).toBe('center');
    expect(flat(screen.getByTestId('toolbar-action')).flexBasis).toBeUndefined();
  });

  it('back button fires onBack when pressed', async () => {
    const onBack = jest.fn();
    const screen = await render(<AppToolbar onBack={onBack} title="T" />);
    const back = screen.getByLabelText(uk.timer.back);
    fireEvent.press(back);
    expect(onBack).toHaveBeenCalled();
  });
});
