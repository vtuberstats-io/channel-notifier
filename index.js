'use strict';

const VTUBER_META_LIST_FILENAME = process.env.VTUBER_META_LIST_FILENAME || 'vtuber-meta-list.json';
const KAFKA_BROKERS = process.env.KAFKA_BROKERS;
const HOSTNAME = process.env.HOSTNAME; // offered by kubernetes automatically

if (!KAFKA_BROKERS) {
  console.error('environment variable KAFKA_BROKERS is not specified!');
  process.exit(1);
}
if (!HOSTNAME) {
  console.error('environment variable HOSTNAME is not specified!');
  process.exit(1);
}

const { Kafka } = require('kafkajs');
const fs = require('fs');

const kafka = new Kafka({
  clientId: HOSTNAME,
  brokers: KAFKA_BROKERS.trim().split(',')
});
const fetchTaskScheduleProducer = kafka.producer();

async function init() {
  console.info(`loading vtuber meta list from ${VTUBER_META_LIST_FILENAME}`);
  const metaList = JSON.parse(fs.readFileSync(VTUBER_META_LIST_FILENAME).toString());

  console.info(`connecting to kafka with brokers: ${KAFKA_BROKERS}`);
  await fetchTaskScheduleProducer.connect();

  console.info(`sending ${metaList.length} tasks to kafka`);
  await fetchTaskScheduleProducer.send({
    acks: -1,
    topic: 'fetch-task-schedule',
    messages: metaList.map((m) => ({
      value: JSON.stringify({
        scheduledTimestamp: new Date().toISOString(),
        vtuberMeta: m
      })
    }))
  });

  console.info('finished, bye');
}

init().catch((err) => console.error(err));
