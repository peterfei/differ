/** Wrapper module for @tauri-apps/plugin-dialog — makes mocking in tests reliable */
export async function openFileDialog(): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  return open({ multiple: false });
}

export async function openDirectoryDialog(): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  return open({ multiple: false, directory: true });
}

export async function saveFileDialog(): Promise<string | null> {
  const { save } = await import('@tauri-apps/plugin-dialog');
  return save();
}
