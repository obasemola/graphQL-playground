require('dotenv').config()
const { ApolloServer, UserInputError, gql } = require('apollo-server')
const mongoose = require('mongoose')
const Book = require('./models/Book')
const Author = require('./models/Author')
const { v1: uuid } = require('uuid')

const url = process.env.MONGODB_URI

console.log('connecting to', url)

mongoose.connect(url, { useNewUrlParser: true, useUnifiedTopology: true, useFindAndModify: false, useCreateIndex: true })
  .then(() => {
    console.log('connected to MongoDB')
  })
  .catch((error) => {
    console.log('error connecting to MongoDB:', error.message)
  })


let authors = [
  {
    name: 'Robert Martin',
    id: "afa51ab0-344d-11e9-a414-719c6709cf3e",
    born: 1952,
  },
  {
    name: 'Martin Fowler',
    id: "afa5b6f0-344d-11e9-a414-719c6709cf3e",
    born: 1963
  },
  {
    name: 'Fyodor Dostoevsky',
    id: "afa5b6f1-344d-11e9-a414-719c6709cf3e",
    born: 1821
  },
  { 
    name: 'Joshua Kerievsky', // birthyear not known
    id: "afa5b6f2-344d-11e9-a414-719c6709cf3e",
  },
  { 
    name: 'Sandi Metz', // birthyear not known
    id: "afa5b6f3-344d-11e9-a414-719c6709cf3e",
  },
]

/*
 * Saattaisi olla järkevämpää assosioida kirja ja sen tekijä tallettamalla kirjan yhteyteen tekijän nimen sijaan tekijän id
 * Yksinkertaisuuden vuoksi tallennamme kuitenkin kirjan yhteyteen tekijän nimen
*/


const typeDefs = gql`

  type Author {
    name: String!
    bookCount: Int!
    born: Int
    id: ID!
  }

  type Book {
    title: String!
    published: Int!
    author: Author!
    id: ID!
    genres: [String!]!
  }

  type User {
    username: String!
    favouriteGenre: String!
    id: ID!
  }

  type Query {
    authorCount: Int!
    bookCount: Int!
    allBooks(author: String, genre: String): [Book!]!
    allAuthors: [Author!]!
  }

  type Mutation {
    addBook (
      title: String!
      published: Int!
      author: String!
      genres: [String!]!
    ): Book
    editAuthor(name: String!, setBornTo: Int!): Author
  }
`

const resolvers = {
  Query: {
    authorCount: () => Author.collection.countDocuments(),
    bookCount: () => Book.collection.countDocuments(),
    allBooks: async (root, args) => {
      if(!args.author && !args.genre){
        return Book.find({})
      }

      const author = await Author.findOne({ name: args.author })
      const authorID = author._id
      let returnedBookAuthors = await Book.find({}).then((books) => {
        return books.map((book) => {
          if(String(book.author) === String(authorID)){
            return book
          } else {
            return
          }
        })
      })

      returnedBookAuthors = returnedBookAuthors.filter(authorBook => authorBook !== undefined)
      return returnedBookAuthors
    },
    allAuthors: () => Author.find({})
  },

  Author: {
    bookCount: async (root) => {
      let count = 0
      await Book.find({}).then((books) => {
        books.map((book) => {
          if(String(root._id) === String(book.author)) {
            count = count + 1
          }
        })
      })

      return count
    }
  },

  Mutation: {
    addBook: async (root, args) => {
      const authorObject = await Author.findOne({ name: args.author })
      if(!authorObject){
        const newAuthor = new Author({ name: args.author })
        if(args.author.length < 4){
          throw new UserInputError("Name of author must be at least 4 characters")
        } else if(args.title.length < 2){
          throw new UserInputError("Title must be at least 2 characters")
        }
        await newAuthor.save()

        const savedAuthorObject = await Author.findOne({ name: args.author })
        const book = new Book({
          ...args,
          author: savedAuthorObject })
          return await book.save()
      }

      const book = new Book({
        ...args,
        author: authorObject })
      
      return await book.save()
    },

    editAuthor: async (root, args) => {

      const author = await Author.findOne({ name: args.name })
      if(!author){
        return null
      }

      const updatedAuthor = { name: args.name, born: args.setBornTo }

      const newUpdate = await Author.findByIdAndUpdate(author._id, updatedAuthor, { new: true })

      return newUpdate

    }
  }
}

const server = new ApolloServer({
  typeDefs,
  resolvers,
})

server.listen().then(({ url }) => {
  console.log(`Server ready at ${url}`)
})