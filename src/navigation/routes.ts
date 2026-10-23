export type RootStackParamList = {
  PinSetup: undefined;
  Today: undefined;
  Timer: { taskId: number };
  PinGate:
    | { intent: 'enterParent' }
    | { intent: 'verify'; sessionId: number }
    | { intent: 'abandon'; sessionId: number };
  ParentHome: undefined;
  TaskListEdit: undefined;
  TaskEdit: { taskId?: number };
  Stats: undefined;
};
