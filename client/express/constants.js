// Client constants for googletine

const constants = {
	// Remote googletine servers to use
	googletineNodes: [
		{
			nodeUrl: 'localhost:7000',
			nodeName: 'local-dev'
		}
	],

	// Client configuration
	port: process.env.GOOGLETINE_CLIENT_PORT || 6000,

	// Session timeout (milliseconds)
	sessionTimeout: 3600000 // 1 hour
};

export { constants };
