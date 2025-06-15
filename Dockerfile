# Use Node.js official LTS image
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Create the files directory for uploads
RUN mkdir -p /app/files

# Expose the app port
EXPOSE 3000

# Start the app
CMD ["npm", "start"]