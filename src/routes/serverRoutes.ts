import {
  createServer,
  deleteServer,
  getAllServers,
  getServer,
  updateServer,
  updateCheckConfig,
  getCheckConfig,
} from '../services/serverService';

export async function serverRoutes(app) {
  app.get('/servers', async () => {
    return getAllServers();
  });

  app.get('/servers/:id', async (req) => {
    const { id } = req.params as any;

    return getServer(id);
  });

  app.post('/servers', async (req) => {
    const data = createServer(req.body as any);
    return { success: true, data: data };
  });

  app.put('/servers/:id', async (req) => {
    const { id } = req.params as { id: string };
    return updateServer(id, req.body as any);
  });

  app.delete('/servers/:id', async (req) => {
    const { id } = req.params as { id: string };
    deleteServer(id);
    return { success: true };
  });

  app.get('/servers/:id/check-config', async (req) => {
    const { id } = req.params as {
      id: string;
    };

    return getCheckConfig(id);
  });

  app.put('/servers/:id/check-config', async (req) => {
    const { id } = req.params as {
      id: string;
    };

    const { processes, directories, fileChecks } = req.body as {
      processes?: any[];
      directories?: any[];
      fileChecks?: any[];
    };

    return updateCheckConfig(id, {
      processes,
      directories,
      fileChecks,
    });
  });
}
