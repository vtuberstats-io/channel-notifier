const MONGODB_URL = process.env.MONGODB_URL;
const KAFKA_BROKERS = process.env.KAFKA_BROKERS;
const HOSTNAME = process.env.HOSTNAME; // offered by kubernetes automatically

if (!MONGODB_URL || !KAFKA_BROKERS || !HOSTNAME) {
  console.error(`missing environment variables, env: ${JSON.stringify(process.env)}`);
  process.exit(1);
}

const { addExitHook, registerExitListener } = require('./lib/exit-hook');
const { Kafka } = require('kafkajs');
const MongoClient = require('mongodb').MongoClient;

const kafka = new Kafka({
  clientId: HOSTNAME,
  brokers: KAFKA_BROKERS.trim().split(',')
});
const fetchTaskScheduleProducer = kafka.producer();
const mongo = new MongoClient(MONGODB_URL);

async function init() {
  console.info('connecting to kafka brokers');
  await fetchTaskScheduleProducer.connect();
  addExitHook(async () => await fetchTaskScheduleProducer.disconnect());

  console.info('connecting to mongodb');
  await mongo.connect();
  addExitHook(async () => await mongo.close());

  console.info('reading metadata from mongodb');
  const db = mongo.db('vtuberstats');
  const vtuberMetaCollection = db.collection('vtuber-meta');
  const vtuberMetaList = (await vtuberMetaCollection.find({}).toArray()).map((item) => ({
    domain: item.domain,
    kind: 'vtuber',
    id: item.id,
    channelId: item.channelId
  }));
  const groupMetaCollection = db.collection('group-meta');
  const groupMetaList = (await groupMetaCollection.find({ type: 'physical' }).toArray()).map(
    (item) => ({
      domain: item.domain,
      kind: 'group',
      id: item.id,
      channelId: item.channelId
    })
  );

  const metaList = [...vtuberMetaList, ...groupMetaList];
  const scheduledTimestamp = new Date().toISOString();
  console.info(`sending ${metaList.length} tasks to kafka`);
  await fetchTaskScheduleProducer.send({
    acks: -1,
    topic: 'fetch-channel-info',
    messages: metaList.map((item) => ({
      value: JSON.stringify({
        scheduledTimestamp,
        ...item
      })
    }))
  });

  console.info('finished, bye');
}

registerExitListener();
init();
