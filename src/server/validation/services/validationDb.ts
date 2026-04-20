import mongoose, { Connection } from 'mongoose';
import { getValidationConfig } from '../config/validationConfig.js';
import { redactSensitiveData } from '../../utils/redaction.js';

let validationConnection: Connection | null = null;
let validationConnectionPromise: Promise<Connection> | null = null;

export const getValidationDbConnection = async (): Promise<Connection> => {
  if (validationConnection?.readyState === 1) {
    return validationConnection;
  }

  if (validationConnectionPromise) {
    return validationConnectionPromise;
  }

  const config = getValidationConfig();
  if (!config.mongo.uri) {
    throw new Error('Validation database URL is not configured. Set VALIDATION_DATABASE_URL or DATABASE_URL.');
  }

  validationConnectionPromise = mongoose
    .createConnection(config.mongo.uri, {
      readPreference: config.mongo.readPreference as any,
      serverSelectionTimeoutMS: config.mongo.serverSelectionTimeoutMs,
    })
    .asPromise()
    .then((connection) => {
      validationConnection = connection;
      validationConnection.on('disconnected', () => {
        validationConnection = null;
        validationConnectionPromise = null;
        console.warn('Validation MongoDB connection disconnected.');
      });
      return connection;
    })
    .catch((error) => {
      validationConnection = null;
      validationConnectionPromise = null;
      console.error('Validation MongoDB connection error:', redactSensitiveData(error));
      throw error;
    });

  return validationConnectionPromise;
};

export const closeValidationDbConnection = async (): Promise<void> => {
  if (validationConnection) {
    await validationConnection.close();
  }
  validationConnection = null;
  validationConnectionPromise = null;
};
