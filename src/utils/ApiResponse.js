class ApiResponse {
  constructor(statusCode, message, data , statusText = "success") {
      this.statusCode = statusCode;
      this.message = message; 
      this.data = data;
      this.success = statusCode < 400;
      // this.statusText = statusText; 
  }
}

export { ApiResponse };
