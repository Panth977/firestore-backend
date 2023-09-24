export class BaseApis {
    async create(ref: FirebaseFirestore.DocumentReference, data: unknown) {
        await ref.create(data as never);
    }
    async update(ref: FirebaseFirestore.DocumentReference, data: unknown) {
        await ref.update(data as never);
    }
    async delete(ref: FirebaseFirestore.DocumentReference) {
        await ref.delete();
    }
    get(query: FirebaseFirestore.Query): Promise<FirebaseFirestore.QuerySnapshot>;
    get(documentRef: FirebaseFirestore.DocumentReference): Promise<FirebaseFirestore.DocumentSnapshot>;
    get<T extends FirebaseFirestore.AggregateSpec>(
        aggregateQuery: FirebaseFirestore.AggregateQuery<T>
    ): Promise<FirebaseFirestore.AggregateQuerySnapshot<T>>;
    get(ref: { get: () => Promise<unknown> }) {
        return ref.get();
    }
}

export class TransactionApi extends BaseApis {
    private transaction: FirebaseFirestore.Transaction;
    constructor(transaction: FirebaseFirestore.Transaction) {
        super();
        this.transaction = transaction;
    }
    create(ref: FirebaseFirestore.DocumentReference, data: unknown) {
        this.transaction.create(ref, data);
        return Promise.resolve();
    }
    update(ref: FirebaseFirestore.DocumentReference, data: unknown) {
        this.transaction.update(ref, data as never);
        return Promise.resolve();
    }
    delete(ref: FirebaseFirestore.DocumentReference) {
        this.transaction.delete(ref);
        return Promise.resolve();
    }
    get(query: FirebaseFirestore.Query): Promise<FirebaseFirestore.QuerySnapshot>;
    get(documentRef: FirebaseFirestore.DocumentReference): Promise<FirebaseFirestore.DocumentSnapshot>;
    get<T extends FirebaseFirestore.AggregateSpec>(
        aggregateQuery: FirebaseFirestore.AggregateQuery<T>
    ): Promise<FirebaseFirestore.AggregateQuerySnapshot<T>>;
    get(ref: never) {
        return this.transaction.get(ref as never) as never;
    }
}

export class BatchApi extends BaseApis {
    private batch: FirebaseFirestore.WriteBatch;
    constructor(batch: FirebaseFirestore.WriteBatch) {
        super();
        this.batch = batch;
    }
    create(ref: FirebaseFirestore.DocumentReference, data: unknown) {
        this.batch.create(ref, data);
        return Promise.resolve();
    }
    update(ref: FirebaseFirestore.DocumentReference, data: unknown) {
        this.batch.update(ref, data as never);
        return Promise.resolve();
    }
    delete(ref: FirebaseFirestore.DocumentReference) {
        this.batch.delete(ref);
        return Promise.resolve();
    }
}
