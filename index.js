const { Connection, Request } = require('tedious');
const EventEmitter = require('events').EventEmitter;

const connectionState = {
  IDLE: 0,
  READY: 1,
  BUSY: 2
}
const requestState = {
  PENDING: 0,
  RUNNING: 1
}

class ConnectionPool extends EventEmitter {
  constructor(poolOptions, connectionOptions) {
    super();
    this.requestTimeout = poolOptions.requestTimeout
    this.log = (message) => console.log(`Pool Info: ${message}`);
    if (typeof poolOptions.log === 'function')
      this.log = poolOptions.log
    else if (!poolOptions.log)
    this.log = () => { }
    this.connectionPool = [];
    this.pendingRequests = [];
    this.log('wait time: ' + poolOptions.waitForIdleConnection)
    this.createConenctions(connectionOptions, poolOptions);
    this.on('new request', (request) => {
      const idleConnection = this.connectionPool.find(connection => connection.status === connectionState.READY);
      if (idleConnection) {
        idleConnection.status = connectionState.BUSY;
        request.status = requestState.RUNNING;
        request.callback({ connection: idleConnection, pending: this.pendingRequests, pool: this });
      }
      else
        setTimeout(() => {
          this.addConnection(poolOptions, connectionOptions)
        }, poolOptions.waitForIdleConnection)
    })
  }

  addConnection = (poolOptions, connectionOptions) => {
    const waitingRequests = this.pendingRequests.reduce((sum, current) => {
      if (current.status === requestState.PENDING)
        sum++;
      return sum;
    }, 0);
    const idleConnections = this.connectionPool.reduce((sum, current) => {
      if (current.status === connectionState.IDLE)
        sum++;
      return sum;
    }, 0);
    const needed = waitingRequests - idleConnections;
    const min = Math.min(this.connectionPool.length + needed, poolOptions.max);
    for (let i = 0; i < min - this.connectionPool.length; i++) {
      const connection = this.newConnection(connectionOptions)
      this.connectionPool.push(connection);
      this.log('new connection added');
    }
    this.log(`length of pool: ${this.connectionPool.length}`);
  }

  newConnection = (connectionOptions) => {
    const connection = new Connection(connectionOptions);
    connection.id = Math.random();
    connection.status = connectionState.IDLE;
    connection.once('connect', () => {
      connection.status = connectionState.READY;
      const pendingRequest = this.pendingRequests.find(element => element.status === requestState.PENDING);
      if (pendingRequest) {
        this.log('pending request id =' + pendingRequest.id);
        this.emit('new request', pendingRequest);
      }
    })
    return connection;
  }
  createConenctions = (connectionOptions, poolOptions) => {
    const self = this;
    for (let i = 0; i < poolOptions.min; i++) {
      const connection = self.newConnection(connectionOptions)
      this.connectionPool.push(connection);
      this.log('new connection added ' + i);
    }
  }

  newRequest = (callback) => {
    const request = {
      status: requestState.PENDING,
      id: Math.random(),
      callback: callback
    }
    this.pendingRequests.push(request);
    this.emit('new request', request)
  }
}
class CPRequest extends Request {
  constructor(sql, callback, props) {
    super(sql, callback);
    this.on('requestCompleted', () => {
      this.emit('requestDone', props)
    })
    this.on('requestDone', (props) => {
      props.connection.status = connectionState.READY;
      console.log('\nfinished!, connection status is ', props.connection.status)
      props.pending.splice(props.pending.indexOf(this), 1);
      console.log('\nremoved from pending ..');
      const pendingRequest = props.pending.find(element => element.status === requestState.PENDING);
      if (pendingRequest) {
        props.pool.log('another pending request' + pendingRequest.id);
        props.pool.emit('new request', pendingRequest);
      }
    })
  }
}

module.exports = {
  ConnectionPool,
  CPRequest
}