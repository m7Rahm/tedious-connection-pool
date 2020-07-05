const { Connection, Request } = require('tedious');
const EventEmitter = require('events').EventEmitter
class ConnectionPool extends EventEmitter {
  constructor(poolOptions, connectionOptions) {
    super();
    const log = poolOptions.log;
    this.connectionPool = [];
    this.pendingRequests = [];
    for (let i = 0; i < poolOptions.max; i++) {
      const connection = new Connection(connectionOptions);
      connection.id = i;
      connection.once('connect', () => {
        connection.status = 'idle';
        const pendingRequest = this.pendingRequests.find(element => element.status === 'pending');
        if (pendingRequest) {
          console.log('pending request id =' + pendingRequest.id);
          this.emit('new request', pendingRequest);
        }
      })
      this.connectionPool.push(connection);
      console.log('new connection added');
    }
    this.on('new request', (request) => {
      const idleConnection = this.connectionPool.find(connection => connection.status === 'idle');
      if (idleConnection) {
        idleConnection.status = 'busy';
        request.status = 'running';
        request.callback({ connection: idleConnection, pending: this.pendingRequests });
        const pendingRequest = this.pendingRequests.find(element => element.status === 'pending');
        if (pendingRequest) {
          console.log('another pending request' + pendingRequest.id);
          this.emit('new request', pendingRequest);
        }
      }
    })
  }
  newRequest = (callback) => {
    const request = {
      status: 'pending',
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
      props.connection.status = 'idle';
      console.log('finished!, connection state is ', props.connection.status)
      props.pending.splice(props.pending.indexOf(this), 1);
      console.log('removed from pending ..');
    })
  }
}
module.exports = {
  ConnectionPool,
  CPRequest
}