import { useScenes } from '../hooks/useScenes';
import { UploadWizard } from '../components/upload/UploadWizard';
import { SceneList } from '../components/scenes/SceneList';
import { deleteScene } from '../api/scenesApi';

export function HomePage() {
  const { scenes, loading, refresh } = useScenes();

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this scene?')) return;
    await deleteScene(id);
    refresh();
  };

  return (
    <div style={{ maxWidth: 800, margin: '0 auto' }}>
      <UploadWizard />

      <div style={{ marginTop: 32 }}>
        <h2 style={{ fontSize: 18, marginBottom: 16 }}>Scenes</h2>
        <SceneList scenes={scenes} loading={loading} onDelete={handleDelete} />
      </div>
    </div>
  );
}
