/** @jest-environment node */
import React from 'react';
import { act, fireEvent } from '@testing-library/react-native';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { ParentHomeScreen } from '../ParentHomeScreen';
import { renderWithApp, setupTestServices } from '../../../test/helpers/renderWithApp';
import { parentSessionStore } from '../../state/parentSessionStore';

const mockFiles: Record<string, string> = {};
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-file-system', () => ({
  Paths: { document: 'file:///documents' },
  File: class MockFile {
    uri: string;
    constructor(...parts: string[]) {
      this.uri = parts.length === 1 ? parts[0]! : `${parts[0]!.replace(/\/$/, '')}/${parts.slice(1).join('/')}`;
    }
    get exists() { return this.uri in mockFiles; }
    async text() { return mockFiles[this.uri] ?? ''; }
    async write(value: string) { mockFiles[this.uri] = value; }
  },
}));

afterEach(() => { jest.restoreAllMocks(); Object.keys(mockFiles).forEach(key => delete mockFiles[key]); });

async function mount() {
  const { services } = await setupTestServices();
  await services.authService.setupPin('1234');
  services.authService.startParentSession();
  parentSessionStore.setService(services.authService);
  const screen = await renderWithApp(
    <ParentHomeScreen navigation={{ addListener: () => () => {}, replace: jest.fn() } as any} route={{} as any} />,
    { services, db: services.db },
  );
  return { screen, services };
}

it('exports all task fields as a versioned JSON file and shares it', async () => {
  jest.mocked(Sharing.isAvailableAsync).mockResolvedValue(true);
  jest.mocked(Sharing.shareAsync).mockResolvedValue(undefined);
  const { screen, services } = await mount();
  const task = await services.tasksRepo.create({ title: 'Математика', emoji: '🧮', targetMinutes: 20, daysMask: 31, category: 'homework', targetPerDay: 2 }, '2026-10-27T10:00:00.000Z');
  await act(async () => { fireEvent.press(screen.getByLabelText('Експортувати базу завдань')); });
  const uri = 'file:///documents/focuskid-tasks.json';
  expect(Sharing.shareAsync).toHaveBeenCalledWith(uri, expect.objectContaining({ mimeType: 'application/json' }));
  const payload = JSON.parse(mockFiles[uri]!);
  expect(payload).toMatchObject({ format: 'focuskid-tasks', version: 1 });
  expect(payload.tasks).toContainEqual(task);
  screen.unmount();
});

it('imports valid tasks with upsert while preserving unrelated tasks', async () => {
  const { screen, services } = await mount();
  const initialCount = (await services.tasksRepo.listAll()).length;
  const unrelated = await services.tasksRepo.create({ title: 'Залишити', targetMinutes: 10, daysMask: 127 }, '2026-10-27T10:00:00.000Z');
  const existing = await services.tasksRepo.create({ title: 'Старе', targetMinutes: 10, daysMask: 127 }, '2026-10-27T10:00:00.000Z');
  const incoming = { ...existing, title: 'Оновлене', targetMinutes: 25, category: 'reading' };
  mockFiles['file:///cache/tasks.json'] = JSON.stringify({ format: 'focuskid-tasks', version: 1, exportedAt: '2026-10-27T10:00:00.000Z', tasks: [incoming, { ...incoming, id: 500, title: 'Нове' }] });
  jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/tasks.json', name: 'tasks.json', mimeType: 'application/json', size: 100, lastModified: 0 }] });
  await act(async () => { fireEvent.press(screen.getByLabelText('Імпортувати базу завдань')); });
  const tasks = await services.tasksRepo.listAll();
  expect(tasks).toHaveLength(initialCount + 3);
  expect(tasks.find(task => task.id === existing.id)?.title).toBe('Оновлене');
  expect(tasks.find(task => task.id === 500)?.title).toBe('Нове');
  expect(tasks.find(task => task.id === unrelated.id)?.title).toBe('Залишити');
  screen.unmount();
});

it('rejects malformed files without changing tasks', async () => {
  const { screen, services } = await mount();
  const originalTasks = await services.tasksRepo.listAll();
  const before = await services.tasksRepo.create({ title: 'Залишити', targetMinutes: 10, daysMask: 127 }, '2026-10-27T10:00:00.000Z');
  mockFiles['file:///cache/bad.json'] = JSON.stringify({ format: 'wrong', version: 1, tasks: [{ id: 2 }] });
  jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/bad.json', name: 'bad.json', mimeType: 'application/json', size: 20, lastModified: 0 }] });
  await act(async () => { fireEvent.press(screen.getByLabelText('Імпортувати базу завдань')); });
  expect((await services.tasksRepo.listAll())).toEqual([...originalTasks, before]);
  expect(screen.getByText('Файл бази завдань пошкоджений або має непідтримуваний формат.')).toBeTruthy();
  screen.unmount();
});

it('does nothing when the document picker is canceled', async () => {
  const { screen, services } = await mount();
  const originalTasks = await services.tasksRepo.listAll();
  jest.mocked(DocumentPicker.getDocumentAsync).mockResolvedValue({ canceled: true, assets: null });
  await act(async () => { fireEvent.press(screen.getByLabelText('Імпортувати базу завдань')); });
  expect(await services.tasksRepo.listAll()).toEqual(originalTasks);
  screen.unmount();
});
