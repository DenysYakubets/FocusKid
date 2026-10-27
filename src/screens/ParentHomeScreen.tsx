import React, { useEffect, useState } from 'react';
import { FlatList, Platform, Share, StyleSheet, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/routes';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import { formatError } from '../services/logging/formatError';
import { logFileUri, logInfo, logError } from '../services/logging/fileLogger';
import { useServices } from '../state/appServices';
import { parentSessionStore } from '../state/parentSessionStore';
import { SessionRow } from '../services/repos/sessionsRepo';
import { MAX_FAILED_ATTEMPTS } from '../services/auth/authService';
import { Task } from '../domain/tasks/types';
import { AppButton } from '../ui/components/AppButton';
import { AppText } from '../ui/components/AppText';
import { NoticeBox } from '../ui/components/NoticeBox';
import { PinPad } from '../ui/components/PinPad';
import { ParentGuard } from '../navigation/ParentGuard';
import { useOrientation } from '../ui/hooks/useOrientation';
import { uk } from '../i18n/uk';
import { colors, radius, shadows, spacing } from '../ui/theme';

type Props = NativeStackScreenProps<RootStackParamList, 'ParentHome'>;

interface AwaitingItem {
  session: SessionRow;
  task: Task | null;
}

export function ParentHomeScreen({ navigation }: Props) {
  const { sessionsRepo, tasksRepo, authService, db, wall } = useServices();
  const orientation = useOrientation();
  const isLandscape = orientation === 'landscape';

  const [awaitingItems, setAwaitingItems] = useState<AwaitingItem[]>([]);
  const [changingPin, setChangingPin] = useState(false);
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [pinDraft, setPinDraft] = useState('');
  const [pinStep, setPinStep] = useState<1 | 2>(1);
  const [pinError, setPinError] = useState<string | null>(null);
  const [lockoutSec, setLockoutSec] = useState(0);
  const [transferNotice, setTransferNotice] = useState<{ tone: 'error' | 'info'; message: string } | null>(null);

  // Monitor lockout countdown via monotonic clock
  useEffect(() => {
    const updateLockout = () => {
      const remMs = authService.lockoutRemainingMs();
      const sec = Math.ceil(remMs / 1000);
      setLockoutSec(sec);
    };

    updateLockout();
    const interval = setInterval(updateLockout, 500);
    interval.unref?.();
    return () => clearInterval(interval);
  }, [authService]);

  const isLocked = lockoutSec > 0;

  const loadData = async () => {
    const completedSessions = await sessionsRepo.listCompleted();
    const items: AwaitingItem[] = await Promise.all(
      completedSessions.map(async (s) => {
        const task = await tasksRepo.get(s.taskId);
        return { session: s, task };
      })
    );
    setAwaitingItems(items);
  };

  useEffect(() => {
    void loadData();
    const unsub = navigation.addListener('focus', () => {
      void loadData();
    });
    return unsub;
  }, [navigation, sessionsRepo, tasksRepo]);

  const handleShareLogs = async () => {
    parentSessionStore.touch();
    try {
      await logInfo('share: preparing log file');
      try {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(logFileUri(), {
            dialogTitle: 'Share FocusKid logs', mimeType: 'text/plain', UTI: 'public.plain-text',
          });
          return;
        }
        void logError('share: fallback reason=expo-sharing unavailable');
      } catch (error) {
        void logError(`share: fallback reason=${formatError(error)}`);
      }
      if (Platform.OS === 'ios') {
        await Share.share({ url: logFileUri() }, { dialogTitle: 'Share logs' });
      } else {
        await Share.share({ title: 'FocusKid logs', message: 'FocusKid diagnostic logs', url: logFileUri() },
          { dialogTitle: 'Share logs', subject: 'FocusKid logs' });
      }
    } catch (error) {
      void logError(`share: failed ${formatError(error)}`);
    }
  };

  const handleExportTasks = async () => {
    parentSessionStore.touch();
    setTransferNotice(null);
    try {
      const payload = { format: 'focuskid-tasks', version: 1, exportedAt: wall.nowIso(), tasks: await tasksRepo.listAll() };
      const file = new File(Paths.document, 'focuskid-tasks.json');
      await file.write(JSON.stringify(payload, null, 2));
      try {
        if (await Sharing.isAvailableAsync()) {
          await Sharing.shareAsync(file.uri, { dialogTitle: uk.parentHome.exportDb, mimeType: 'application/json' });
          return;
        }
      } catch {
        // Use the platform share sheet when expo-sharing is unavailable or fails.
      }
      if (Platform.OS === 'ios') {
        await Share.share({ url: file.uri }, { dialogTitle: uk.parentHome.exportDb });
      } else {
        await Share.share({ title: uk.parentHome.exportDb, message: uk.parentHome.exportDb, url: file.uri }, { dialogTitle: uk.parentHome.exportDb });
      }
    } catch {
      setTransferNotice({ tone: 'error', message: uk.parentHome.exportDbError });
    }
  };

  const handleImportTasks = async () => {
    parentSessionStore.touch();
    setTransferNotice(null);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
      if (result.canceled || !result.assets?.[0]) return;
      const parsed: unknown = JSON.parse(await new File(result.assets[0].uri).text());
      if (!isTasksExport(parsed)) {
        setTransferNotice({ tone: 'error', message: uk.parentHome.importDbError });
        return;
      }
      await db.transaction(async tx => {
        for (const task of parsed.tasks) {
          await tx.run(
            `INSERT INTO tasks (id, title, emoji, target_minutes, days_mask, sort_order, archived, target_per_day, category, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET title=excluded.title, emoji=excluded.emoji, target_minutes=excluded.target_minutes,
               days_mask=excluded.days_mask, sort_order=excluded.sort_order, archived=excluded.archived,
               target_per_day=excluded.target_per_day, category=excluded.category, created_at=excluded.created_at, updated_at=excluded.updated_at;`,
            [task.id, task.title, task.emoji, task.targetMinutes, task.daysMask, task.sortOrder, task.archived ? 1 : 0,
              task.targetPerDay, task.category, task.createdAt, task.updatedAt],
          );
        }
      });
      setTransferNotice({ tone: 'info', message: uk.parentHome.importDbSuccess(parsed.tasks.length) });
    } catch {
      setTransferNotice({ tone: 'error', message: uk.parentHome.importDbError });
    }
  };

  const handleExit = () => {
    parentSessionStore.exit();
    navigation.reset({
      index: 0,
      routes: [{ name: 'Today' }],
    });
  };

  const handleVerify = (sessionId: number) => {
    parentSessionStore.touch();
    navigation.navigate('PinGate', { intent: 'verify', sessionId });
  };

  const handleAbandon = (sessionId: number) => {
    parentSessionStore.touch();
    navigation.navigate('PinGate', { intent: 'abandon', sessionId });
  };

  const handleChangePin = () => {
    parentSessionStore.touch();
    setChangingPin(!changingPin);
    setPinStep(1);
    setPinError(null);
    setPinDraft('');
  };

  const handleChangePinComplete = async (entered: string) => {
    if (isLocked) return;
    parentSessionStore.touch();
    setPinDraft('');
    if (pinStep === 1) {
      setCurrentPinInput(entered);
      setPinStep(2);
      setPinError(null);
    } else {
      try {
        const ok = await authService.changePin(currentPinInput, entered);
        if (ok) {
          setChangingPin(false);
          setPinStep(1);
          setCurrentPinInput('');
          setPinError(null);
        } else {
          let msg: string = uk.pin.invalidPin;
          try {
            const failed = await authService.failedAttempts();
            const left = Math.max(0, MAX_FAILED_ATTEMPTS - failed);
            if (left > 0) {
              msg = `${uk.pin.invalidPin}. ${uk.pin.attemptsLeft(left)}`;
            }
          } catch {
            // Guard with try/catch
          }
          setPinError(msg);
          setPinStep(1);
          setCurrentPinInput('');
        }
      } catch {
        setPinError(uk.pin.operationFailed);
        setPinStep(1);
        setCurrentPinInput('');
      }
    }
  };

  const headerNode = (
    <View style={styles.header}>
      <AppText
        variant="title"
        accessibilityRole="header"
        numberOfLines={1}
        style={styles.title}
      >
        {uk.parentHome.title}
      </AppText>
      <AppButton
        label={uk.parentHome.exit}
        variant="danger"
        size="sm"
        onPress={handleExit}
      />
    </View>
  );

  // §4.6: deterministic stacked column replaces the wrapping chip row.
  const navNode = (
    <View style={styles.navColumn}>
      <AppButton label={uk.parentHome.exportDb} variant="secondary" size="lg" onPress={handleExportTasks} />
      <AppButton label={uk.parentHome.importDb} variant="secondary" size="lg" onPress={handleImportTasks} />
      {transferNotice && <NoticeBox tone={transferNotice.tone} message={transferNotice.message} />}
      <AppButton
        label="Поділитися журналом"
        variant="secondary"
        size="lg"
        onPress={handleShareLogs}
      />
      <AppButton
        label={uk.parentHome.tasks}
        variant="secondary"
        size="lg"
        onPress={() => {
          parentSessionStore.touch();
          navigation.navigate('TaskListEdit');
        }}
      />
      <AppButton
        label={uk.parentHome.stats}
        variant="secondary"
        size="lg"
        onPress={() => {
          parentSessionStore.touch();
          navigation.navigate('Stats');
        }}
      />
      <AppButton
        label={uk.parentHome.changePin}
        variant="secondary"
        size="lg"
        onPress={handleChangePin}
      />
    </View>
  );

  const changePinNode = changingPin ? (
    <View style={styles.changePinBox}>
      <AppText variant="body" style={styles.changePinPrompt}>
        {pinStep === 1 ? uk.parentHome.enterCurrentPin : uk.parentHome.enterNewPin}
      </AppText>
      {isLocked ? (
        <NoticeBox
          testID="parenthome-lockout"
          tone="warning"
          message={`${uk.pin.lockedRemaining} ${lockoutSec} ${uk.pin.seconds}`}
        />
      ) : pinError ? (
        <NoticeBox testID="parenthome-pinerror" tone="error" message={pinError} />
      ) : null}
      <PinPad
        disabled={isLocked}
        value={pinDraft}
        onChange={setPinDraft}
        onComplete={handleChangePinComplete}
      />
    </View>
  ) : null;

  const awaitingNode = (
    <View style={styles.awaitingSection}>
      <AppText variant="heading" accessibilityRole="header" style={styles.sectionTitle}>
        {uk.parentHome.awaitingTitle}
      </AppText>

      {awaitingItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <AppText variant="body" style={styles.emptyText}>
            {uk.parentHome.emptyAwaiting}
          </AppText>
        </View>
      ) : (
        <FlatList
          style={styles.list}
          data={awaitingItems}
          keyExtractor={(item) => String(item.session.id)}
          contentContainerStyle={styles.listContent}
          onScroll={() => parentSessionStore.touch()}
          scrollEventThrottle={1000}
          renderItem={({ item }) => (
            <View style={styles.itemCard}>
              <View style={styles.itemInfo}>
                <AppText variant="title" numberOfLines={2} style={styles.itemTitle}>
                  {item.task?.emoji
                    ? `${item.task.emoji} ${item.task.title}`
                    : item.task?.title ?? uk.parentHome.taskFallback}
                </AppText>
              </View>

              <View style={styles.itemActions}>
                <AppButton
                  label={uk.parentHome.verify}
                  a11yLabel={`${uk.parentHome.verify}: ${item.task?.title ?? ''}`}
                  variant="primary"
                  size="md"
                  onPress={() => handleVerify(item.session.id)}
                  style={styles.actionFlex}
                />
                <AppButton
                  label={uk.parentHome.abandon}
                  a11yLabel={`${uk.parentHome.abandon}: ${item.task?.title ?? ''}`}
                  variant="danger"
                  size="md"
                  onPress={() => handleAbandon(item.session.id)}
                  style={styles.actionFlex}
                />
              </View>
            </View>
          )}
        />
      )}
    </View>
  );

  return (
    <ParentGuard navigation={navigation}>
      <View
        testID={isLandscape ? 'parent-home-layout-landscape' : 'parent-home-layout-portrait'}
        style={[styles.container, isLandscape && styles.containerLandscape]}
      >
        {isLandscape ? (
          // INV-08: left = header + nav + change-PIN, right = awaiting list.
          <View style={styles.landscapeRow}>
            <View style={styles.leftColumn}>
              {headerNode}
              {navNode}
              {changePinNode}
            </View>
            <View style={styles.rightColumn}>{awaitingNode}</View>
          </View>
        ) : (
          <>
            {headerNode}
            {navNode}
            {changePinNode}
            {awaitingNode}
          </>
        )}
      </View>
    </ParentGuard>
  );
}

interface ImportedTask {
  id: number;
  title: string;
  emoji: string | null;
  targetMinutes: number;
  daysMask: number;
  sortOrder: number;
  targetPerDay: number;
  category: 'homework' | 'reading' | 'sport' | 'other';
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

function isTasksExport(value: unknown): value is { tasks: ImportedTask[] } {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Record<string, unknown>;
  if (payload.format !== 'focuskid-tasks' || payload.version !== 1 || !Array.isArray(payload.tasks)) return false;
  return payload.tasks.every((entry: unknown) => {
    if (!entry || typeof entry !== 'object') return false;
    const task = entry as Record<string, unknown>;
    return Number.isSafeInteger(task.id) && (task.id as number) > 0
      && typeof task.title === 'string' && task.title.trim().length >= 1 && task.title.length <= 60
      && (task.emoji === null || (typeof task.emoji === 'string' && task.emoji.length <= 8))
      && Number.isInteger(task.targetMinutes) && (task.targetMinutes as number) >= 1 && (task.targetMinutes as number) <= 120
      && Number.isInteger(task.daysMask) && (task.daysMask as number) >= 1 && (task.daysMask as number) <= 127
      && Number.isInteger(task.sortOrder)
      && Number.isInteger(task.targetPerDay) && (task.targetPerDay as number) >= 1 && (task.targetPerDay as number) <= 10
      && ['homework', 'reading', 'sport', 'other'].includes(task.category as string)
      && typeof task.archived === 'boolean'
      && isIsoDate(task.createdAt) && isIsoDate(task.updatedAt);
  });
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && value.length > 0;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  containerLandscape: {
    paddingHorizontal: spacing.xl,
  },
  landscapeRow: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xl,
  },
  leftColumn: {
    flex: 1,
    gap: spacing.lg,
  },
  rightColumn: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    rowGap: spacing.sm,
    columnGap: spacing.sm,
  },
  title: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    color: colors.text,
  },
  navColumn: {
    gap: spacing.sm,
  },
  changePinBox: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderCurve: 'continuous',
    width: '100%',
    gap: spacing.md,
  },
  changePinPrompt: {
    color: colors.text,
    textAlign: 'center',
  },
  awaitingSection: {
    flex: 1,
    gap: spacing.md,
  },
  sectionTitle: {
    color: colors.text,
  },
  emptyContainer: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  list: {
    flex: 1,
  },
  listContent: {
    gap: spacing.md,
    paddingBottom: spacing.xxl,
  },
  itemCard: {
    backgroundColor: colors.cardBg,
    borderRadius: radius.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: colors.border,
    boxShadow: shadows.card,
    padding: spacing.md,
    gap: spacing.md,
  },
  itemInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemTitle: {
    flex: 1,
    minWidth: 0,
    flexShrink: 1,
    color: colors.text,
  },
  itemActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.s12,
  },
  actionFlex: {
    flex: 1,
  },
});
