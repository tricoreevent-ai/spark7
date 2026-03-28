import { Schema, SchemaType } from 'mongoose';
import { getCurrentTenantId } from '../../services/tenantContext.js';

type SchemaWithTenantOption = Schema & {
  options: Schema['options'] & {
    tenantScoped?: boolean;
    tenantUniqueRewrite?: boolean;
  };
};

const TENANT_FIELD = 'tenantId';

const hasTenantInObject = (value: unknown): boolean => {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(hasTenantInObject);

  const obj = value as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(obj, TENANT_FIELD)) return true;
  return Object.values(obj).some(hasTenantInObject);
};

const stripPathUniqueIndexes = (schema: SchemaWithTenantOption): void => {
  const shouldRewrite = schema.options.tenantUniqueRewrite !== false;
  if (!shouldRewrite) return;

  schema.eachPath((pathName: string, schemaType: SchemaType) => {
    const options = (schemaType as any)?.options as Record<string, unknown> | undefined;
    if (!options || options.unique !== true) return;

    const sparse = options.sparse === true;
    options.unique = false;
    if ((schemaType as any)?._index) {
      (schemaType as any)._index = false;
    }

    if (pathName === TENANT_FIELD) return;

    const indexOptions: Record<string, unknown> = { unique: true };
    if (sparse) {
      // Compound sparse indexes still include docs when tenantId exists; use partial to skip empty optional values.
      indexOptions.partialFilterExpression = {
        [pathName]: { $gt: '' },
      };
    }

    schema.index({ [TENANT_FIELD]: 1, [pathName]: 1 }, indexOptions as any);
  });
};

const setTenantOnDoc = (doc: any, tenantId: string | undefined): void => {
  if (!tenantId || !doc || typeof doc !== 'object') return;
  if (doc[TENANT_FIELD]) return;
  doc[TENANT_FIELD] = tenantId;
};

export const tenantScopedPlugin = (schema: Schema): void => {
  const tenantSchema = schema as SchemaWithTenantOption;
  const schemaAny = tenantSchema as any;
  if (tenantSchema.options.tenantScoped === false) return;

  if (!tenantSchema.path(TENANT_FIELD)) {
    tenantSchema.add({
      [TENANT_FIELD]: {
        type: String,
        trim: true,
        index: true,
      },
    });
  }

  stripPathUniqueIndexes(tenantSchema);

  const scopeQuery = function (this: any) {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;

    const filter = typeof this.getFilter === 'function' ? this.getFilter() : {};
    if (!hasTenantInObject(filter)) {
      this.where({ [TENANT_FIELD]: tenantId });
    }
  };

  const queryHooks: Array<
    | 'countDocuments'
    | 'deleteMany'
    | 'deleteOne'
    | 'find'
    | 'findOne'
    | 'findOneAndDelete'
    | 'findOneAndReplace'
    | 'findOneAndUpdate'
    | 'replaceOne'
    | 'updateMany'
    | 'updateOne'
  > = [
    'countDocuments',
    'deleteMany',
    'deleteOne',
    'find',
    'findOne',
    'findOneAndDelete',
    'findOneAndReplace',
    'findOneAndUpdate',
    'replaceOne',
    'updateMany',
    'updateOne',
  ];

  queryHooks.forEach((hook) => {
    schemaAny.pre(hook, scopeQuery);
  });

  schemaAny.pre('aggregate', function (this: any) {
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;

    const pipeline = this.pipeline();
    const firstStage = pipeline[0] || {};
    const alreadyScoped = hasTenantInObject(firstStage);
    if (!alreadyScoped) {
      pipeline.unshift({ $match: { [TENANT_FIELD]: tenantId } });
    }
  });

  schemaAny.pre('save', function (this: any) {
    const tenantId = getCurrentTenantId();
    setTenantOnDoc(this, tenantId);
  });

  schemaAny.pre('insertMany', function (this: any, arg1: any, arg2: any) {
    const tenantId = getCurrentTenantId();
    const docs = Array.isArray(arg1) ? arg1 : Array.isArray(arg2) ? arg2 : [];
    if (tenantId && Array.isArray(docs)) {
      docs.forEach((doc) => setTenantOnDoc(doc, tenantId));
    }
  });
};
