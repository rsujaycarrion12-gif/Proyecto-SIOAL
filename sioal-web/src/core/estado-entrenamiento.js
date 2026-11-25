/**
 * Estado del módulo de entrenamiento (carga desde localStorage).
 */
'use strict';

// Auditoría 7: el entrenamiento tiene su propio control de versiones, igual que el inventario.
let expectedTrainingRaw = null;
let training;
try {
  expectedTrainingRaw = localStorage.getItem(TRAIN_KEY);
  training = expectedTrainingRaw ? JSON.parse(expectedTrainingRaw) : structuredClone(TRAINED_SIMULATION_120K);
} catch (e) {
  training = structuredClone(tInitial);
}
if (!training.weeks || !Array.isArray(training.weeks)) training = structuredClone(tInitial);
const trainUI = { tab: 'datos', metric: 'kg', horizon: 4 };

invalidateOutdatedStoredForecasts(training);
// Una afirmación de verificación incluida en JSON/localStorage NO certifica la procedencia.
training.sourceVerified = false;
if (training.trained?.results)
  for (const r of Object.values(training.trained.results))
    if (r && typeof r === 'object') r.validated = false;
let lastTrainingState = JSON.stringify(training),
  staleTrainingStorage = false;
