FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY server/package*.json ./server/
WORKDIR /app/server
RUN npm install

# Copy the rest of the app source code
WORKDIR /app
COPY . .

# Expose the port the app runs on
EXPOSE 5000

# Start the server
WORKDIR /app/server
CMD ["npm", "start"]
